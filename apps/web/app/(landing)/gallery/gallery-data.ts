import type { GridView, SortKey } from './_components/Toolbar'
import { splitOperation } from '@/lib/gallery/naming'

/* ============================================================================
   The archive, flattened.

   `/api/gallery` returns the storage tree as it sits on disk — years holding
   operations holding stages holding filenames. That shape is right for walking
   the folders and wrong for everything this page does: filtering, counting and
   sorting all want one flat list of photographs that each know where they came
   from.
   ========================================================================== */

export type Photo = {
    /** Stable across renders and unique — the storage path, effectively. */
    id: string
    file: string
    year: string
    /** The folder name, verbatim. Needed to build the fetch URL. */
    operation: string
    /** The folder name with its ordering prefix removed — for reading. */
    opLabel: string
    /** The stripped prefix, or a large number so unnumbered folders sort last. */
    opOrder: number
    mission: string
    src: string
}


export function photoSrc(p: { year: string, operation: string, mission: string, file: string }): string {
    const q = new URLSearchParams({
        year: p.year,
        operation: p.operation,
        stage: p.mission,
        img: p.file,
    })
    return `/api/gallery/fetch?${q}`
}

export function flatten(years: GalleryAPI['years']): Photo[] {
    const out: Photo[] = []
    for (const y of years) {
        for (const op of y.operations) {
            const { label, order } = splitOperation(op.operation)
            for (const stage of op.stages) {
                for (const file of stage.media) {
                    out.push({
                        id: `${y.year}/${op.operation}/${stage.stage}/${file}`,
                        file,
                        year: y.year,
                        operation: op.operation,
                        opLabel: label,
                        opOrder: order,
                        mission: stage.stage,
                        src: photoSrc({ year: y.year, operation: op.operation, mission: stage.stage, file }),
                    })
                }
            }
        }
    }
    return out
}

/* ---------- filtering ----------------------------------------------------- */

export type Facet = 'year' | 'operation' | 'mission'

export type Filters = {
    q: string
    year: Set<string>
    operation: Set<string>
    mission: Set<string>
}

export const emptyFilters = (): Filters => ({
    q: '',
    year: new Set(),
    operation: new Set(),
    mission: new Set(),
})

/**
 * `skip` is what makes the facet counts honest.
 *
 * A count next to "2025" should say how many photographs you would see if you
 * ticked it — which means every *other* filter applies but that facet's own
 * selections do not. Counting with all filters applied would show 0 beside
 * every year except the one already selected, which tells you nothing.
 */
export function matches(p: Photo, f: Filters, skip?: Facet): boolean {
    if (f.q) {
        const haystack = `${p.opLabel} ${p.mission} ${p.year} ${p.file}`.toLowerCase()
        if (!haystack.includes(f.q.toLowerCase())) return false
    }
    if (skip !== 'year' && f.year.size && !f.year.has(p.year)) return false
    if (skip !== 'operation' && f.operation.size && !f.operation.has(p.operation)) return false
    if (skip !== 'mission' && f.mission.size && !f.mission.has(p.mission)) return false
    return true
}

export function sortPhotos(list: Photo[], sort: SortKey): Photo[] {
    const byOp = (a: Photo, b: Photo) => a.opOrder - b.opOrder || a.opLabel.localeCompare(b.opLabel)
    const out = list.slice()

    if (sort === 'new') out.sort((a, b) => Number(b.year) - Number(a.year) || b.opOrder - a.opOrder || a.file.localeCompare(b.file))
    if (sort === 'old') out.sort((a, b) => Number(a.year) - Number(b.year) || byOp(a, b) || a.file.localeCompare(b.file))
    if (sort === 'op') out.sort((a, b) => byOp(a, b) || Number(b.year) - Number(a.year))

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
 * more than one year and they are not the same operation.
 */
export function groupByOperation(list: Photo[]): OperationGroup[] {
    const groups = new Map<string, OperationGroup>()
    for (const p of list) {
        const key = `${p.year}/${p.operation}`
        let group = groups.get(key)
        if (!group) {
            group = { key, operation: p.operation, label: p.opLabel, year: p.year, photos: [] }
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
export function archiveStats(years: GalleryAPI['years']): ArchiveStats {
    let photographs = 0
    let operations = 0
    let missions = 0

    for (const y of years) {
        operations += y.operations.length
        for (const op of y.operations) {
            missions += op.stages.length
            for (const stage of op.stages) photographs += stage.media.length
        }
    }

    const numeric = years.map(y => y.year).filter(y => /^\d{4}$/.test(y)).sort()

    return { photographs, operations, missions, earliest: numeric[0] ?? null }
}

export type { GridView, SortKey }
export { splitOperation }
