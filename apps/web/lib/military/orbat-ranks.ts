/**
 * Reading current ranks out of the ORBAT spreadsheet.
 *
 * The ORBAT is a grid, not a table: every section is a pair of adjacent
 * columns (job title, then occupant) laid out side by side across the sheet,
 * and the same columns change meaning partway down the file. Rather than
 * model the layout, this reads every cell and keeps the ones that look like a
 * person — a known rank abbreviation followed by a name. Section headings,
 * job titles and the sheet's own furniture have no rank prefix and fall out.
 *
 * Pure: no database, no filesystem, no clock.
 */
import { isRankAbbr } from '@asot/lib'

/**
 * Misspelled rank abbreviations in the sheet, mapped to the catalog's.
 *
 * Only transpositions and other unambiguous slips belong here. A prefix that
 * could plausibly be a rank the catalog does not have must stay unrecognised,
 * so the cell is reported rather than silently assigned the wrong rank.
 */
export const ABBR_TYPOS: Record<string, string> = {
    TRP: 'TPR',   // Trooper — appears as "TRP(S) Pluto"
}

/**
 * Splits one CSV line into cells.
 *
 * `parseRow` in lib/orbat/csv-parser is not reused: it toggles on every quote
 * character, so a field containing an escaped quote ("" inside a quoted cell)
 * loses the quote and, worse, flips the parser's state for the rest of the
 * line — shifting every cell after it into the wrong column. Today's export
 * has no quotes anywhere, so both parsers agree on it; a future one with a
 * comma or an apostrophe-heavy cell would not be so forgiving, and a silent
 * column shift is exactly the failure this file cannot survive.
 */
export function splitCsvRow(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let quoted = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (quoted) {
            if (char !== '"') current += char
            else if (line[i + 1] === '"') { current += '"'; i++ }
            else quoted = false
        } else if (char === '"') {
            quoted = true
        } else if (char === ',') {
            cells.push(current)
            current = ''
        } else {
            current += char
        }
    }
    cells.push(current)
    return cells
}

export type RankedName = {
    abbr: string
    name: string
}

export type OrbatCell = RankedName & {
    /** 1-based line in the source file, so a conflict can be traced back. */
    line: number
    /** 0-based column, which identifies the section the person was sitting in. */
    col: number
}

/**
 * A cell as it should have been written.
 *
 * Collapses runs of whitespace, and rejoins a rank whose proficiency suffix
 * was typed with a space before it ("PTE (SL) Wanderer"). The rejoin is
 * anchored to the start so it can only ever touch the rank prefix — a name or
 * heading with a parenthesised part further along is left alone.
 */
export function normaliseCell(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().replace(/^([A-Za-z][A-Za-z/.-]*) (\([A-Za-z]{1,2}\))/, '$1$2')
}

/** The catalog spelling of an abbreviation, or null if it is not a rank. */
export function canonicalAbbr(raw: string): string | null {
    const value = raw.toUpperCase()
    if (isRankAbbr(value)) return value

    // Retry with the prefix corrected, so "TRP(S)" reaches "TPR(S)".
    const root = value.split('(')[0]
    const fixed = ABBR_TYPOS[root]
    if (!fixed) return null
    const corrected = fixed + value.slice(root.length)
    return isRankAbbr(corrected) ? corrected : null
}

/**
 * Splits "CPL(S) Nadric" into its rank and name, or returns null when the
 * cell is not a person — which is what every heading and job title does.
 */
export function splitRankedName(raw: string): RankedName | null {
    const cell = normaliseCell(raw)
    const space = cell.indexOf(' ')
    if (space < 1) return null

    const abbr = canonicalAbbr(cell.slice(0, space))
    if (!abbr) return null

    const name = cell.slice(space + 1).trim()
    return name ? { abbr, name } : null
}

/** Every cell in the sheet that names a person, in reading order. */
export function parseOrbat(text: string): OrbatCell[] {
    const found: OrbatCell[] = []

    text.replace(/^﻿/, '').split(/\r?\n/).forEach((line, index) => {
        splitCsvRow(line).forEach((raw, col) => {
            const person = splitRankedName(raw)
            if (person) found.push({ ...person, line: index + 1, col })
        })
    })
    return found
}

export type OrbatConflict = {
    name: string
    seats: OrbatCell[]
}

/**
 * The sheet's ranks, one per person.
 *
 * Appearing twice is normal — a reservist can also hold a seat in a section —
 * and costs nothing while both cells agree. Two cells that disagree are a
 * mistake in the sheet, and this reports them rather than picking one: the
 * whole point of the sync is that the sheet is the authority, and an
 * authority that contradicts itself has not decided yet.
 */
export function orbatRanks(text: string): { ranks: Map<string, OrbatCell>; conflicts: OrbatConflict[] } {
    const seats = new Map<string, OrbatCell[]>()
    for (const cell of parseOrbat(text)) {
        const key = cell.name.toLowerCase()
        seats.set(key, (seats.get(key) ?? []).concat(cell))
    }

    const ranks = new Map<string, OrbatCell>()
    const conflicts: OrbatConflict[] = []
    for (const list of seats.values()) {
        if (list.every(c => c.abbr === list[0].abbr)) ranks.set(list[0].name, list[0])
        else conflicts.push({ name: list[0].name, seats: list })
    }
    return { ranks, conflicts }
}

/**
 * A stored `name` with a rank prefix still attached, repaired — or null when
 * the name is already clean.
 *
 * An earlier import split "PTE (SL) Wanderer" on its first space and stored
 * the remainder as the member's name, which is how three members ended up
 * called "(SL) Wanderer", "(L) Dawn" and "TRP(S) Pluto". Both shapes are
 * recognised: a whole rank the split never removed, and the orphaned suffix
 * left behind when it removed only half of one.
 */
export function repairedName(stored: string): string | null {
    const value = stored.replace(/\s+/g, ' ').trim()
    const space = value.indexOf(' ')
    if (space < 1) return null

    const prefix = value.slice(0, space)
    const isOrphanSuffix = /^\([A-Za-z]{1,2}\)$/.test(prefix)
    if (!isOrphanSuffix && !canonicalAbbr(prefix)) return null

    const rest = value.slice(space + 1).trim()
    return rest && rest !== value ? rest : null
}
