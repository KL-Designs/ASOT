/**
 * Turning the Media tab's query string into a Mongo filter and sort.
 *
 * Pure, and separate from the route, because this is where the mistakes are:
 * a search that scans the collection because a caption contained '.*', a page
 * that shows the same photograph twice because the sort had no tie-break, a
 * stale bookmark that 500s because a view name no longer exists. None of that
 * needs a database to test.
 *
 * Every filter is scoped to `status: 'live'`. The Media tab is the archive,
 * not the review queue — pending and rejected items belong to the Submissions
 * tab, which has its own route.
 */

export type LibraryView = 'all' | 'unknown' | 'nocaption' | 'videos' | 'health'
export type LibrarySort = 'newest' | 'oldest' | 'rated' | 'operation'

export type LibraryParams = {
    view: LibraryView
    year: string | null
    operation: string | null
    mission: string | null
    tag: string | null
    author: string | null
    kind: 'image' | 'video' | null
    q: string | null
    sort: LibrarySort
    page: number
}

/** Tiles per page. Sixty fills the grid at every breakpoint without asking a
 *  reviewer to scroll a four-thousand-item list. */
export const PAGE_SIZE = 60

const VIEWS: readonly LibraryView[] = ['all', 'unknown', 'nocaption', 'videos', 'health']
const SORTS: readonly LibrarySort[] = ['newest', 'oldest', 'rated', 'operation']

// Type predicates rather than `as` casts: VIEWS/SORTS are the single source
// of truth for what's valid, and a predicate keeps a value that fails the
// check from ever being treated as the narrowed type.
function isLibraryView(value: string | null): value is LibraryView {
    return VIEWS.some(v => v === value)
}

function isLibrarySort(value: string | null): value is LibrarySort {
    return SORTS.some(s => s === value)
}

/** Absent, empty and whitespace-only all mean "not filtering on this". */
function str(search: URLSearchParams, key: string): string | null {
    const raw = search.get(key)
    if (raw === null) return null
    const trimmed = raw.trim()
    return trimmed === '' ? null : trimmed
}

export function parseLibraryParams(search: URLSearchParams): LibraryParams {
    const view = search.get('view')
    const sort = search.get('sort')
    const kind = search.get('kind')
    const page = Number(search.get('page'))

    return {
        // A value that is not in the list is a typo or a stale bookmark. Fall
        // back rather than 500 — the tab is a staff tool, not an API contract.
        view: isLibraryView(view) ? view : 'all',
        year: str(search, 'year'),
        operation: str(search, 'operation'),
        mission: str(search, 'mission'),
        tag: str(search, 'tag'),
        author: str(search, 'author'),
        kind: kind === 'image' || kind === 'video' ? kind : null,
        q: str(search, 'q'),
        sort: isLibrarySort(sort) ? sort : 'newest',
        page: Number.isInteger(page) && page > 0 ? page : 0,
    }
}

/** A caption is member-supplied. Unescaped, '.*' scans the whole collection
 *  and an unbalanced '(' throws inside the driver. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildLibraryFilter(params: LibraryParams): Record<string, unknown> {
    const filter: Record<string, unknown> = { status: 'live' }

    if (params.view === 'unknown') filter.operationId = { $exists: false }
    // Absent and empty both mean uncaptioned: the migration writes neither,
    // and a reviewer who clears a caption leaves an empty string.
    if (params.view === 'nocaption') filter.caption = { $in: [null, ''] }
    if (params.view === 'videos') filter.kind = 'video'

    // 'Unknown' is the rail's synthesised label for a document with no year
    // or operation at all (facets/route.ts does `row._id.year ?? 'Unknown'`),
    // not a value any producer ever writes to the field. index-gallery.mjs's
    // Unknown pass, relocate.ts's resolveOperationFolder (operationId null)
    // and content-path.ts's parseContentPath all agree: the Unknown folder
    // means year/operation are OMITTED, never the literal string — see
    // GalleryMedia's own doc comment ("all absent together when the
    // submitter chose Unknown"). A literal match against 'Unknown' would
    // therefore match nothing, dead-ending the rail's own Unknown row on
    // exactly the items it exists to surface.
    if (params.year === 'Unknown') filter.year = { $exists: false }
    else if (params.year) filter.year = params.year
    if (params.operation === 'Unknown') filter.operation = { $exists: false }
    else if (params.operation) filter.operation = params.operation
    if (params.mission) filter.mission = params.mission
    if (params.tag) filter.tags = params.tag
    if (params.author) filter.authorName = params.author
    // After the view, so an explicit kind filter wins over the Videos view
    // rather than silently disagreeing with the chip the reviewer can see.
    if (params.kind) filter.kind = params.kind

    if (params.q) {
        const pattern = escapeRegex(params.q)
        filter.$or = [
            { caption: { $regex: pattern, $options: 'i' } },
            { authorName: { $regex: pattern, $options: 'i' } },
            { storageKey: { $regex: pattern, $options: 'i' } },
        ]
    }

    return filter
}

/**
 * Every sort ends in `_id`.
 *
 * Mongo's order between documents with equal sort keys is unspecified, and the
 * archive has thousands of items sharing a `takenAt` — one operation's whole
 * weekend carries the same date. Without a tie-break, paging through them can
 * show one photograph twice and never show another.
 */
export function buildLibrarySort(sort: LibrarySort): Record<string, 1 | -1> {
    switch (sort) {
        case 'oldest': return { takenAt: 1, _id: 1 }
        case 'rated': return { up: -1, _id: 1 }
        case 'operation': return { year: 1, operation: 1, mission: 1, _id: 1 }
        default: return { takenAt: -1, _id: 1 }
    }
}
