/**
 * The shape of a path inside storage/gallery/content.
 *
 *     {year}/{operation}/{mission}/{file}   legacy files, from the old tree
 *     {year}/{operation}/{file}             published submissions — no mission
 *     Unknown/{file}                        no operation, or none resolvable
 *
 * Parsing is the direction that matters. When a human drags a file into a
 * different folder in a downloaded backup, this is what reads their intent
 * back out: the folders they chose become the operation the item belongs to.
 * So it is lenient about shapes this module would not itself produce — a
 * year folder holding loose files, repeated slashes — and strict about
 * anything that leaves the tree.
 *
 * Pure: no fs, no mongodb, no imports.
 */

/** Per directory segment. With filenames.ts's 80-character name cap, a
 *  worst-case path stays inside Windows' 260-character limit. */
export const MAX_SEGMENT = 120

/** A literal folder, sitting beside the year folders. */
export const UNKNOWN_FOLDER = 'Unknown'

/* Path separators, the Windows-reserved set and control characters. Square
   brackets are NOT stripped here — unlike a filename, a directory segment
   cannot be confused for an id suffix, and real operation folders contain
   parentheses and full stops that must survive. */
const ILLEGAL = /[/\\:*?"<>|\u0000-\u001f]/g

export function sanitizeSegment(raw: string): string {
    const cleaned = String(raw)
        .replace(ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')

    // Trimmed again after the cap: slicing can land on a dot or a space, and
    // Windows would silently drop it.
    return cleaned.slice(0, MAX_SEGMENT).replace(/[. ]+$/, '')
}

export type ContentFacets = {
    year: string | null
    operation: string | null
    mission: string | null
    file: string
}

export function parseContentPath(relative: string): ContentFacets | null {
    if (!relative) return null

    // Empty segments come from a leading or doubled slash and carry no
    // meaning; dropping them is what makes '/2021//op/I/x.png' parse.
    const segments = relative.split('/').filter(s => s !== '')

    if (segments.length < 2 || segments.length > 4) return null
    // '.' / '..' would climb out of content/; a literal backslash means the
    // input came from a Windows path that was never split into segments, and
    // treating it as one opaque segment would silently misfile it.
    if (segments.some(s => s === '.' || s === '..' || s.includes('\\'))) return null

    const file = segments[segments.length - 1]
    const dirs = segments.slice(0, -1)

    if (dirs.length === 1) {
        return dirs[0] === UNKNOWN_FOLDER
            ? { year: null, operation: null, mission: null, file }
            : { year: dirs[0], operation: null, mission: null, file }
    }

    if (dirs.length === 2) return { year: dirs[0], operation: dirs[1], mission: null, file }

    return { year: dirs[0], operation: dirs[1], mission: dirs[2], file }
}

export function buildContentPath(f: {
    year?: string | null
    operation?: string | null
    mission?: string | null
    file: string
}): string {
    // Both or neither. A year without an operation is a shape parseContentPath
    // tolerates from a human but this must never create, because there would
    // be no folder to read an operation back out of.
    if (!f.year || !f.operation) return `${UNKNOWN_FOLDER}/${f.file}`

    return [f.year, f.operation, f.mission || null, f.file].filter(Boolean).join('/')
}
