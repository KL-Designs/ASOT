import { NextResponse } from 'next/server'
import type { Filter } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * The Media tab's left rail.
 *
 * Every row carries a count, because "1,157 unknown" is a job a reviewer can
 * watch shrink, while an uncounted row is a folder they have to open to find
 * out whether it is worth opening.
 *
 * One aggregation for the tree rather than one query per node: the archive has
 * 5 years, 88 operations and several hundred missions, and a query per node
 * would be several hundred round trips every time the tab mounts.
 */

/* Every key is optional as well as nullable: `$group` OMITS a field that is
   missing from the document rather than grouping it as null, so the runtime
   value for an item with no year is `undefined`, not `null`. Harmless as
   written — every read below goes through `??` — but the old `string | null`
   would have quietly lied to anyone who wrote `=== null`. */
type TreeRow = {
    _id: {
        year?: string | null
        campaign?: string | null
        operation?: string | null
        opLabel?: string | null
        mission?: string | null
    }
    count: number
}

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const live: Filter<GalleryMedia> = { status: 'live' }
    const unknownFilter: Filter<GalleryMedia> = { ...live, operationId: { $exists: false } }
    const videosFilter: Filter<GalleryMedia> = { ...live, kind: 'video' }
    // Record<string, unknown>, not Filter<GalleryMedia>, and only this one:
    // `caption` is schema-typed `string | undefined`, never `null`, but an
    // absent caption and an explicit null both mean uncaptioned (a reviewer
    // clearing a caption leaves an empty string, the migration leaves the
    // field absent — neither ever writes null, so this is a defensive query,
    // not a real value the schema should allow). Filter<GalleryMedia> would
    // reject the null in `$in`, so only this filter is widened — `live`,
    // `unknownFilter` and `videosFilter` above all check cleanly against the
    // real schema and stay narrow so a typo'd field name or value (e.g.
    // `kind: 'vidoe'`) is still a compile error.
    const nocaptionFilter: Record<string, unknown> = { ...live, caption: { $in: [null, ''] } }

    const [all, unknown, nocaption, videos, health, tree, tagDocs, tagCounts, authorCounts] = await Promise.all([
        Db.galleryMedia.countDocuments(live),
        Db.galleryMedia.countDocuments(unknownFilter),
        Db.galleryMedia.countDocuments(nocaptionFilter),
        Db.galleryMedia.countDocuments(videosFilter),
        Db.galleryHealth.findOne({}),
        Db.galleryMedia.aggregate<TreeRow>([
            { $match: live },
            { $group: { _id: { year: '$year', campaign: '$campaign', operation: '$operation', opLabel: '$opLabel', mission: '$mission' }, count: { $sum: 1 } } },
        ]).toArray(),
        Db.galleryTags.find({}).toArray(),
        Db.galleryMedia.aggregate<{ _id: string, count: number }>([
            { $match: live }, { $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } },
        ]).toArray(),
        Db.galleryMedia.aggregate<{ _id: string, count: number }>([
            { $match: { ...live, authorName: { $type: 'string' } } },
            { $group: { _id: '$authorName', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]).toArray(),
    ])

    /* Assembled here rather than in the aggregation because the tree is small
       (a few hundred rows) and $group cannot nest. A missing year or operation
       is filed under 'Unknown' rather than dropped — those are exactly the
       items a reviewer opened this tab to fix.

       `row._id.year`/`row._id.operation` is `null` when the field is absent
       from the document, and can independently be the literal string
       'Unknown' when a document actually holds that word — relocate.ts's
       undated-operation branch writes an operation's raw, unvalidated title
       verbatim, so an admin can title a real Operation exactly 'Unknown';
       and pre-fix parseContentPath used to write the literal string as a
       year for a nested `Unknown/SomeFolder/x.jpg`, and documents written
       that way are still in the database. A plain `row._id.year ?? 'Unknown'`
       folds both into the same map key, so the row's count includes the
       literal-string documents — but buildLibraryFilter's `yearUnset`/
       `operationUnset` (lib/gallery/library-query.ts) only ever match
       `{ $exists: false }`, which excludes them. The row's count and what
       clicking it returns would disagree. UNSET keys the absent case with a
       control character sanitizeSegment (content-path.ts) strips from every
       value this route can otherwise see, so it can never collide with a
       real field value — including the literal string 'Unknown' — and the
       two stay distinguishable all the way to the API response via the
       `unset` flag below, rather than being silently re-merged the way `??`
       would. */
    const UNSET = '\u0000'

    type OpNode = { labelCounts: Map<string, number>, count: number, missions: Map<string, number> }
    type OpMap = Map<string, OpNode>
    /* Two buckets per year: the campaigns, and the operations that belong to
       none. Not one tree with a synthetic "no campaign" node in it — most of
       the archive has no campaign, and a row a reviewer has to click through
       on every single legacy folder is a level of nothing. */
    type YearNode = { campaigns: Map<string, OpMap>, operations: OpMap }

    const years = new Map<string, YearNode>()

    for (const row of tree) {
        const yearKey = row._id.year ?? UNSET
        const opKey = row._id.operation ?? UNSET
        // Falls back to the operation's own display value (not a hardcoded
        // 'Unknown') so a literal-'Unknown' operation with no opLabel still
        // shows 'Unknown' rather than the control-character key leaking out.
        const opLabel = row._id.opLabel ?? (opKey === UNSET ? 'Unknown' : opKey)

        const year = years.get(yearKey) ?? { campaigns: new Map<string, OpMap>(), operations: new Map() }
        years.set(yearKey, year)

        /* An absent campaign routes into the year's own operations list rather
           than becoming an UNSET-keyed campaign row — which is also why the
           campaign level needs no `unset` flag of its own, unlike year and
           operation: absence is a different BUCKET here, not a row that has to
           be told apart from a campaign literally named 'Unknown'. */
        let ops: OpMap
        if (row._id.campaign) {
            ops = year.campaigns.get(row._id.campaign) ?? new Map()
            year.campaigns.set(row._id.campaign, ops)
        } else {
            ops = year.operations
        }

        const op = ops.get(opKey) ?? { labelCounts: new Map<string, number>(), count: 0, missions: new Map<string, number>() }
        ops.set(opKey, op)

        op.count += row.count
        // opLabel isn't picked here, only tallied: $group makes no promise
        // about row order, so "whichever row happened to arrive first" would
        // make the label flip between otherwise identical calls whenever an
        // operation carries more than one label (imports have left both
        // 'Operation Nightfall' and 'Op Nightfall (draft)' on the same
        // operation before). The winner is decided once, after the loop, by
        // which label actually covers the most documents.
        op.labelCounts.set(opLabel, (op.labelCounts.get(opLabel) ?? 0) + row.count)
        if (row._id.mission) op.missions.set(row._id.mission, (op.missions.get(row._id.mission) ?? 0) + row.count)
    }

    // Most-documents wins; a tie breaks on the label text so the result is
    // stable rather than depending on Map insertion order (which is itself
    // just $group's unspecified row order, one step removed).
    function majorityLabel(labelCounts: Map<string, number>): string {
        return [...labelCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    }

    /* The UNSET bucket (if present) is always placed last, regardless of
       where a raw control character would otherwise sort under locale-aware
       comparison. Doing this explicitly is what actually guarantees the
       field-missing row sorts last, which the previous single-key version
       only got by coincidence of comparing the literal word against digit
       years. `known` is sorted with `compare`; the unset entry, if any, is
       appended after. */
    function orderedEntries<T>(map: Map<string, T>, compare: (a: string, b: string) => number): [string, T][] {
        const known: [string, T][] = []
        let unset: [string, T] | undefined
        for (const entry of map) {
            if (entry[0] === UNSET) unset = entry
            else known.push(entry)
        }
        known.sort((a, b) => compare(a[0], b[0]))
        return unset ? [...known, unset] : known
    }

    const total = (ops: OpMap) => [...ops.values()].reduce((n, op) => n + op.count, 0)

    /* One renderer for both places an operation row appears — directly under a
       year, and under one of that year's campaigns. A second copy is how the
       two would come to sort differently or disagree about `unset`. */
    const operationRows = (ops: OpMap): LibraryOperationRow[] =>
        orderedEntries(ops, (a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([opKey, op]) => ({
                operation: opKey === UNSET ? 'Unknown' : opKey,
                opLabel: majorityLabel(op.labelCounts),
                unset: opKey === UNSET,
                count: op.count,
                missions: [...op.missions.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                    .map(([mission, count]) => ({ mission, count })),
            }))

    const facets: LibraryFacetsAPI = {
        views: {
            all,
            unknown,
            nocaption,
            videos,
            /* `unreadable` counts too. It is not a resolvable row like the
               other three — it is "this report is incomplete by an unknown
               amount" (see ReconcileReport's own docstring) — but leaving it
               out let the rail read Health · 0 on a scan that could not read
               the disk at all, which is the moment the archive is least
               healthy. A non-zero count is what sends someone into the view
               where HealthView says so in words. */
            health: health
                ? health.missingFiles.length + health.notIndexed.length + health.failedProcessing.length + health.unreadable
                : 0,
        },
        // Descending, so the years with the most work sit at the top — and
        // the field-missing row sorts last, which orderedEntries guarantees
        // explicitly (see its own comment) rather than leaving to how a
        // control character happens to compare against a digit year.
        years: orderedEntries(years, (a, b) => b.localeCompare(a))
            .map(([yearKey, year]) => ({
                year: yearKey === UNSET ? 'Unknown' : yearKey,
                unset: yearKey === UNSET,
                // Both buckets, or a year holding only campaign items would
                // read as empty in the rail while its rows still listed.
                count: [...year.campaigns.values()].reduce((n, ops) => n + total(ops), 0) + total(year.operations),
                campaigns: [...year.campaigns.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                    .map(([campaign, ops]) => ({ campaign, count: total(ops), operations: operationRows(ops) })),
                operations: operationRows(year.operations),
            })),
        tags: tagDocs
            .filter(t => !t.retired)
            .sort((a, b) => a.order - b.order)
            .map(t => ({
                slug: t.slug,
                label: t.label,
                count: tagCounts.find(c => c._id === t.slug)?.count ?? 0,
            })),
        authors: authorCounts.map(a => ({ name: a._id, count: a.count })),
    }

    return NextResponse.json(facets)
}
