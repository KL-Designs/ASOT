import type { GridView, SortKey } from './_components/Toolbar'
import { splitOperation } from '@/lib/gallery/naming'

/* ============================================================================
   The archive, as one flat list.

   `/api/gallery` used to return the storage tree as it sits on disk — years
   holding operations holding stages holding filenames — and this file
   immediately flattened it, because filtering, counting and sorting all want
   one flat list of photographs that each know where they came from. Now that
   the route reads `gallery_media`, it returns the flat list directly, so
   there is nothing left here to flatten.
   ========================================================================== */

/** A gallery item, as the page holds it. Identical to what the API sends —
 *  the flattening step this file used to perform now happens server-side. */
export type Photo = GalleryItemAPI

/* ---------- filtering ----------------------------------------------------- */

export type Facet = 'year' | 'operation' | 'mission' | 'tag' | 'author'

export type Filters = {
    q: string
    year: Set<string>
    operation: Set<string>
    mission: Set<string>
    tag: Set<string>
    author: Set<string>
    /** Not a facet — a segmented control in the toolbar. */
    media: 'all' | 'image' | 'video'
}

export const emptyFilters = (): Filters => ({
    q: '', year: new Set(), operation: new Set(), mission: new Set(),
    tag: new Set(), author: new Set(), media: 'all',
})

/** The value a facet filters on, for an item that may not have it. Items
 *  missing a facet are excluded by any selection on it, which is the honest
 *  answer: an undated submission is not "in 2025". */
function facetValues(p: Photo, facet: Facet): string[] {
    if (facet === 'year') return p.year ? [p.year] : []
    if (facet === 'operation') return p.operation ? [p.operation] : []
    if (facet === 'mission') return p.mission ? [p.mission] : []
    if (facet === 'author') return p.authorName ? [p.authorName] : []
    return p.tags
}

/**
 * `skip` is what makes the facet counts honest.
 *
 * A count next to "2025" should say how many photographs you would see if you
 * ticked it — which means every *other* filter applies but that facet's own
 * selections do not. Counting with all filters applied would show 0 beside
 * every year except the one already selected, which tells you nothing.
 */
export function matches(p: Photo, f: Filters, skip?: Facet): boolean {
    if (f.media !== 'all' && p.kind !== f.media) return false

    if (f.q) {
        const haystack = [p.opLabel, p.mission, p.year, p.caption, p.authorName, ...p.tags]
            .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(f.q.toLowerCase())) return false
    }

    for (const facet of ['year', 'operation', 'mission', 'tag', 'author'] as const) {
        if (skip === facet) continue
        const selected = f[facet]
        if (!selected.size) continue
        if (!facetValues(p, facet).some(v => selected.has(v))) return false
    }

    return true
}

export function sortPhotos(list: Photo[], sort: SortKey): Photo[] {
    /* An item with no date sorts last under every date order rather than
       first. "Unknown operation" is missing information, not the beginning of
       time, and putting it at the top of Newest first would give the gallery a
       front page of undated submissions. */
    const when = (p: Photo) => (p.takenAt ? Date.parse(p.takenAt) : null)
    const byDate = (a: Photo, b: Photo, dir: 1 | -1) => {
        const x = when(a), y = when(b)
        if (x === null && y === null) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (y - x) * dir
    }
    const byOp = (a: Photo, b: Photo) =>
        a.opOrder - b.opOrder || (a.opLabel ?? '').localeCompare(b.opLabel ?? '')

    const out = list.slice()
    if (sort === 'new') out.sort((a, b) => byDate(a, b, 1) || byOp(a, b))
    if (sort === 'old') out.sort((a, b) => byDate(a, b, -1) || byOp(a, b))
    if (sort === 'op') out.sort((a, b) => byOp(a, b) || byDate(a, b, 1))
    if (sort === 'top') out.sort((a, b) => b.score - a.score || (b.up - b.down) - (a.up - a.down) || byDate(a, b, 1))
    return out
}

export type OperationGroup = {
    key: string
    /** Raw folder name — what the operation facet filters on. */
    operation: string
    label: string
    year: string
    photos: Photo[]
}

/**
 * Groups for the by-operation view, in the order the sort already put them.
 *
 * Keyed on year *and* folder, because the same operation name can appear under
 * more than one year and they are not the same operation. Items with no
 * operation (Unknown) fall into a single 'unknown' group rather than each
 * spawning their own — there is nothing to distinguish them by.
 */
export function groupByOperation(list: Photo[]): OperationGroup[] {
    const groups = new Map<string, OperationGroup>()
    for (const p of list) {
        const key = p.operation ? `${p.year ?? '—'}/${p.operation}` : 'unknown'
        let group = groups.get(key)
        if (!group) {
            group = {
                key,
                operation: p.operation ?? '',
                label: p.opLabel ?? 'Unknown operation',
                year: p.year ?? '',
                photos: [],
            }
            groups.set(key, group)
        }
        group.photos.push(p)
    }
    return [...groups.values()]
}

/* ---------- archive-wide figures ------------------------------------------ */

export type ArchiveStats = {
    photographs: number
    operations: number
    missions: number
    earliest: string | null
}

/*
   The mockup's fourth figure was "Contributors". Nothing in storage records who
   shot what — the tree is years/operations/missions/files and no more — so
   inventing a number there was never an option. Missions is the figure the
   archive actually holds, and it says something the other three don't: how
   finely the operations are broken down.
*/
export function archiveStats(items: Photo[]): ArchiveStats {
    const operations = new Set<string>()
    const missions = new Set<string>()
    let earliest: string | null = null

    for (const p of items) {
        if (p.operation) operations.add(`${p.year ?? ''}/${p.operation}`)
        if (p.mission && p.operation) missions.add(`${p.year ?? ''}/${p.operation}/${p.mission}`)
        if (p.year && /^\d{4}$/.test(p.year) && (earliest === null || p.year < earliest)) earliest = p.year
    }

    return { photographs: items.length, operations: operations.size, missions: missions.size, earliest }
}

export type { GridView, SortKey }
export { splitOperation }
