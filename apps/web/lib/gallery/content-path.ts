/**
 * The shape of a path inside storage/gallery/content.
 *
 *     {year}/{campaign}/{mission}/{Saturday|Sunday}/{file}  a campaign mission
 *     {year}/{operation}/{Saturday|Sunday}/{file}           a single mission
 *     {year}/{operation}/{mission}/{file}   legacy files, from the old tree
 *     {year}/{operation}/{file}             published submissions — no day
 *     Unknown/{file}                        no operation, or none resolvable
 *
 * The campaign level exists because J2 already models one. Deriving the top
 * folder from the operation title alone gave three sibling top-level folders
 * for "Operation Trinity I/II/III" — three missions of ONE campaign — and the
 * campaign that groups them was never consulted.
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
   parentheses and full stops that must survive.

   This is also the only thing standing between a campaign name — free text an
   admin types into the J2 campaign organiser, exactly as unvalidated as an
   operation title — and a filesystem path. featured-path.ts exists because a
   user-supplied path segment reached path.resolve unchecked once already and
   served the repository-root .env over an unauthenticated endpoint. A campaign
   name goes through this same door as an operation title, and no other. */
const ILLEGAL = /[/\\:*?"<>|\x00-\x1f]/g

export function sanitizeSegment(raw: string): string {
    const cleaned = String(raw)
        .replace(ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')

    // Trimmed again after the cap: slicing can land on a dot or a space, and
    // Windows would silently drop it. That final trim is also what neutralises
    // a segment of "." or ".." — both reduce to the empty string rather than
    // to a traversal step, and every caller drops an empty segment.
    return cleaned.slice(0, MAX_SEGMENT).replace(/[. ]+$/, '')
}

export type ContentFacets = {
    year: string | null
    /** The campaign folder. Only a five-segment path carries one. */
    campaign: string | null
    operation: string | null
    mission: string | null
    file: string
}

export function parseContentPath(relative: string): ContentFacets | null {
    if (!relative) return null

    // Empty segments come from a leading or doubled slash and carry no
    // meaning; dropping them is what makes '/2021//op/I/x.png' parse.
    const segments = relative.split('/').filter(s => s !== '')

    if (segments.length < 2 || segments.length > 5) return null
    // '.' / '..' would climb out of content/; a literal backslash means the
    // input came from a Windows path that was never split into segments, and
    // treating it as one opaque segment would silently misfile it.
    if (segments.some(s => s === '.' || s === '..' || s.includes('\\'))) return null

    const file = segments[segments.length - 1]
    const dirs = segments.slice(0, -1)

    // Unknown/ means "no year", at any depth — not "the year is literally
    // called Unknown". A human reorganising a downloaded backup can nest
    // folders under it (Unknown/SomeFolder/x.jpg), and that must still read
    // back as operation: 'SomeFolder' with no year, the same as it would one
    // level up. Checked once here rather than per-branch below, so a future
    // depth can't reintroduce the literal-string bug this replaced.
    const isUnknown = dirs[0] === UNKNOWN_FOLDER
    const year = isUnknown ? null : dirs[0]

    if (dirs.length === 1) return { year, campaign: null, operation: null, mission: null, file }
    if (dirs.length === 2) return { year, campaign: null, operation: dirs[1], mission: null, file }

    /* THREE directories is genuinely ambiguous, and is read the legacy way on
       purpose. It is what the old archive produced for every one of its
       thousands of files ({year}/{operation}/{mission}); what a single mission
       with a day slot produces ({year}/{operation}/Saturday); and also what a
       campaign mission whose operation has NO day slot produces
       ({year}/{campaign}/{mission}). Nothing in the path separates the third
       from the first two — the day names are a closed vocabulary but a legacy
       mission folder is not — and this module is pure, so it cannot ask the
       database which folders name campaigns.

       operation+mission is the reading that cannot lose anything: for the
       legacy tree it is simply correct, and for the campaign case both folder
       NAMES still reach the two facets the rail renders, one channel across,
       rather than a `campaign` being invented for a folder that is far more
       likely to be an operation. The cost is narrow and known: a
       campaign-with-no-day file that a human MOVES loses its `campaign` facet
       on the next reconcile (an unmoved one is never re-derived at all — see
       reconcile.ts's pending push). An operation with no day slot is one J2
       has not finished filling in. */
    if (dirs.length === 3) return { year, campaign: null, operation: dirs[1], mission: dirs[2], file }

    // Four directories can only have come from the campaign grammar: the
    // legacy tree was never deeper than year/operation/mission.
    return { year, campaign: dirs[1], operation: dirs[2], mission: dirs[3], file }
}

export function buildContentPath(f: {
    year?: string | null
    campaign?: string | null
    operation?: string | null
    mission?: string | null
    file: string
}): string {
    /* Both or neither. A year without an operation is a shape parseContentPath
       tolerates from a human but this must never create, because there would
       be no folder to read an operation back out of.

       It is also what stops a campaign ever being emitted on its own:
       `{year}/{campaign}/{file}` would parse straight back as an OPERATION
       named after the campaign, so the facets a file was written with and the
       facets read off its own path would name different things for one
       document — the split this subsystem exists to prevent. */
    if (!f.year || !f.operation) return `${UNKNOWN_FOLDER}/${f.file}`

    return [f.year, f.campaign || null, f.operation, f.mission || null, f.file].filter(Boolean).join('/')
}
