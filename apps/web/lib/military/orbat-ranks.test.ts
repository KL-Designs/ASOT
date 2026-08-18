import { describe, test, expect } from 'vitest'
import {
    splitCsvRow, normaliseCell, canonicalAbbr, splitRankedName,
    parseOrbat, orbatRanks, repairedName,
} from './orbat-ranks'

describe('splitCsvRow', () => {
    test('splits a plain row', () => {
        expect(splitCsvRow('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    test('keeps empty cells, so column positions are preserved', () => {
        expect(splitCsvRow(',,x,,')).toEqual(['', '', 'x', '', ''])
    })

    test('a comma inside quotes does not split the cell', () => {
        expect(splitCsvRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
    })

    // The reason lib/orbat/csv-parser's parseRow is not reused. It toggles on
    // every quote, so the second quote of an escaped pair re-enters quoted
    // state and the following comma stops separating cells — every cell after
    // it lands one column to the left, which in a grid this wide silently
    // reassigns people to other sections.
    test('an escaped quote does not shift the following columns', () => {
        expect(splitCsvRow('a,"say ""hi""",b,c')).toEqual(['a', 'say "hi"', 'b', 'c'])
    })

    test('a quoted empty cell is still a cell', () => {
        expect(splitCsvRow('a,"",b')).toEqual(['a', '', 'b'])
    })
})

describe('normaliseCell', () => {
    test('collapses runs of whitespace', () => {
        expect(normaliseCell('  PTE   Johno ')).toBe('PTE Johno')
    })

    // "PTE (SL) Wanderer" in the sheet. Left alone, the first token is "PTE"
    // and the member imports one rank too low.
    test('rejoins a proficiency suffix typed with a space before it', () => {
        expect(normaliseCell('PTE (SL) Wanderer')).toBe('PTE(SL) Wanderer')
    })

    test('leaves a parenthesised part that is not the rank suffix alone', () => {
        expect(normaliseCell('COMPANY RESERVISTS (ACTIVE)')).toBe('COMPANY RESERVISTS (ACTIVE)')
    })
})

describe('canonicalAbbr', () => {
    test('accepts a catalog abbreviation', () => {
        expect(canonicalAbbr('CPL(S)')).toBe('CPL(S)')
        expect(canonicalAbbr('MAJGEN')).toBe('MAJGEN')
    })

    test('uppercases a lowercased one', () => {
        expect(canonicalAbbr('pte(l)')).toBe('PTE(L)')
    })

    // "TRP(S) Pluto" — Trooper is TPR. The transposition is in the sheet and
    // in the member's stored name.
    test('corrects a transposed abbreviation, keeping its suffix', () => {
        expect(canonicalAbbr('TRP(S)')).toBe('TPR(S)')
        expect(canonicalAbbr('TRP')).toBe('TPR')
    })

    test('rejects anything that is not a rank', () => {
        expect(canonicalAbbr('Sapper')).toBeNull()
        expect(canonicalAbbr('COMPANY')).toBeNull()
        expect(canonicalAbbr('Zeus')).toBeNull()
    })

    // A typo correction must not invent a rank the catalog does not have.
    test('a corrected prefix with an impossible suffix is still rejected', () => {
        expect(canonicalAbbr('TRP(Z)')).toBeNull()
    })
})

describe('splitRankedName', () => {
    test('splits rank from name', () => {
        expect(splitRankedName('CPL(S) Nadric')).toEqual({ abbr: 'CPL(S)', name: 'Nadric' })
    })

    test('keeps a name containing spaces', () => {
        expect(splitRankedName('LT(C) Res Head')).toEqual({ abbr: 'LT(C)', name: 'Res Head' })
    })

    test('applies the suffix rejoin and the typo map together', () => {
        expect(splitRankedName('PTE (SL) Wanderer')).toEqual({ abbr: 'PTE(SL)', name: 'Wanderer' })
        expect(splitRankedName('TRP(S) Pluto')).toEqual({ abbr: 'TPR(S)', name: 'Pluto' })
    })

    // Every heading, job title and stray label in the sheet lands here.
    test('rejects a cell that is not a person', () => {
        expect(splitRankedName('Section Commander')).toBeNull()
        expect(splitRankedName('1-3 ECHO - COMBAT ENGINEERS')).toBeNull()
        expect(splitRankedName('COMPANY RESERVISTS (ACTIVE)')).toBeNull()
        expect(splitRankedName('ASOT Discord')).toBeNull()
        expect(splitRankedName('')).toBeNull()
        expect(splitRankedName('PTE')).toBeNull()
        expect(splitRankedName('PTE ')).toBeNull()
    })
})

describe('parseOrbat', () => {
    const sheet = [
        ',1-1 - Infantry Platoon,,,,,,COMPANY RESERVISTS (ACTIVE)',
        ',Section Commander,,CPL(S) Nadric,,,,PTE(S) Slaydevil',
        ',Machinegunner,,,,,,REC Frosty',
    ].join('\r\n')

    test('finds people anywhere in the grid and records where', () => {
        expect(parseOrbat(sheet)).toEqual([
            { abbr: 'CPL(S)', name: 'Nadric',    line: 2, col: 3 },
            { abbr: 'PTE(S)', name: 'Slaydevil', line: 2, col: 7 },
            { abbr: 'REC',    name: 'Frosty',    line: 3, col: 7 },
        ])
    })

    test('strips the UTF-8 BOM', () => {
        expect(parseOrbat('﻿REC Frosty')).toHaveLength(1)
    })

    test('an empty vacancy row yields nobody', () => {
        expect(parseOrbat(',Machinegunner,,,,,,')).toEqual([])
    })
})

describe('orbatRanks', () => {
    test('one seat gives one rank', () => {
        const { ranks, conflicts } = orbatRanks(',CPL(S) Nadric')
        expect(ranks.get('Nadric')!.abbr).toBe('CPL(S)')
        expect(conflicts).toEqual([])
    })

    // Sitting in a section and appearing in the reservist column is normal.
    test('two seats that agree are not a conflict', () => {
        const { ranks, conflicts } = orbatRanks('REC Fade,,REC Fade')
        expect(ranks.get('Fade')!.abbr).toBe('REC')
        expect(conflicts).toEqual([])
    })

    test('matching is case-insensitive across seats', () => {
        const { ranks, conflicts } = orbatRanks('REC Fade,,REC fade')
        expect(ranks.size).toBe(1)
        expect(conflicts).toEqual([])
    })

    // The sheet is the authority, so a sheet that contradicts itself has not
    // decided — report it rather than pick a seat.
    test('two seats that disagree are reported and yield no rank', () => {
        const { ranks, conflicts } = orbatRanks('PTE Bumble,,SAP Bumble')
        expect(ranks.has('Bumble')).toBe(false)
        expect(conflicts).toHaveLength(1)
        expect(conflicts[0].seats.map(s => s.abbr)).toEqual(['PTE', 'SAP'])
    })
})

describe('repairedName', () => {
    // All three are live: an earlier import split "PTE (SL) Wanderer" on its
    // first space and stored the remainder as the member's name.
    test('removes an orphaned proficiency suffix', () => {
        expect(repairedName('(SL) Wanderer')).toBe('Wanderer')
        expect(repairedName('(L) Dawn')).toBe('Dawn')
    })

    test('removes a whole rank left on the name', () => {
        expect(repairedName('TRP(S) Pluto')).toBe('Pluto')
        expect(repairedName('PTE(S) Koda')).toBe('Koda')
    })

    test('leaves a clean name alone', () => {
        expect(repairedName('Koda')).toBeNull()
        expect(repairedName('Agent Dove')).toBeNull()
        expect(repairedName('')).toBeNull()
    })

    // A name is not a rank cell: only a leading rank or orphan suffix is
    // stripped, and never more than one.
    test('strips only the leading rank, not a later one', () => {
        expect(repairedName('PTE(S) PTE Koda')).toBe('PTE Koda')
    })
})
