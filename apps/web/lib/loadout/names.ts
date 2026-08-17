import table from './generated/arma-items.json'

/**
 * Classname -> readable name, in three layers: the generated dictionary, hand
 * overrides, then an algorithmic fallback.
 *
 * The fallback is the floor. A member who equips something added after the dump
 * must still get a legible row, so nothing here may return an empty string.
 *
 * Server-side only. The table is ~2.7MB; the browser receives resolved strings
 * for the ~60 items in one loadout, never the table.
 */

export type ItemMeta = { name: string; root: string; type: number; mod: string }

type Row = [name: string, root: string, type: number, mod: string]
const TABLE = table as unknown as Record<string, Row>

/** Wins over the generated file, for names the unit words differently. */
// Object.create(null) rather than {}: a member controls their own export and
// the parser accepts any string as a classname, so a classname of
// 'constructor'/'toString'/etc must not resolve to an inherited prototype
// member — see resolveItemName below.
const OVERRIDES: Record<string, string> = Object.create(null)

const VENDOR = /^(CUP|ACE|ace|kat|KAT|TFAR|MRH|ASOT|SP|CFP|VME|JAM)_/
const TYPE_INFIX = /^(arifle|srifle|hgun|launch|optic|acc|muzzle|bipod|item|weapon|mag|bag|vest|uniform|headgear|glasses|nvg)_/i

export function itemMeta(className: string): ItemMeta | null {
    const row = TABLE[className]
    // Array check, not truthiness: TABLE['constructor'] inherits a truthy
    // function from Object.prototype and would otherwise pass as a row.
    if (!Array.isArray(row)) return null
    return { name: row[0], root: row[1], type: row[2], mod: row[3] }
}

export function prettifyClassName(className: string): string {
    let s = className.replace(VENDOR, '')
    s = s.replace(TYPE_INFIX, '')
    if (s.length === 0) return className

    const words = s
        .split('_')
        .filter(Boolean)
        // camelCase only, never digit-then-capital: including digits splits
        // "M4A3" into "M4 A3". Verified against the real classnames.
        .flatMap(part => part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' '))
        .filter(Boolean)
        .map(w => (/^[A-Z0-9]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))

    return words.length > 0 ? words.join(' ') : className
}

export function resolveItemName(className: string): string {
    const override = OVERRIDES[className]
    const listed = TABLE[className]
    const name = typeof override === 'string' ? override
        : Array.isArray(listed) && typeof listed[0] === 'string' ? listed[0]
        : ''
    // Never empty: this is the last thing standing between a stray classname
    // and a blank row on a public page.
    return name || prettifyClassName(className) || className
}
