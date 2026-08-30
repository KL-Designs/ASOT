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

type TreeRow = { _id: { year: string | null, operation: string | null, opLabel: string | null, mission: string | null }, count: number }

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
            { $group: { _id: { year: '$year', operation: '$operation', opLabel: '$opLabel', mission: '$mission' }, count: { $sum: 1 } } },
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
       items a reviewer opened this tab to fix. */
    const years = new Map<string, Map<string, { labelCounts: Map<string, number>, count: number, missions: Map<string, number> }>>()

    for (const row of tree) {
        const year = row._id.year ?? 'Unknown'
        const operation = row._id.operation ?? 'Unknown'
        const opLabel = row._id.opLabel ?? operation

        const ops = years.get(year) ?? new Map()
        years.set(year, ops)

        const op = ops.get(operation) ?? { labelCounts: new Map<string, number>(), count: 0, missions: new Map<string, number>() }
        ops.set(operation, op)

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

    const facets: LibraryFacetsAPI = {
        views: {
            all,
            unknown,
            nocaption,
            videos,
            health: health
                ? health.missingFiles.length + health.notIndexed.length + health.failedProcessing.length
                : 0,
        },
        // Descending, so the years with the most work sit at the top —
        // and 'Unknown' sorts last by name, which is where it belongs.
        years: [...years.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([year, ops]) => ({
                year,
                count: [...ops.values()].reduce((n, op) => n + op.count, 0),
                operations: [...ops.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                    .map(([operation, op]) => ({
                        operation,
                        opLabel: majorityLabel(op.labelCounts),
                        count: op.count,
                        missions: [...op.missions.entries()]
                            .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                            .map(([mission, count]) => ({ mission, count })),
                    })),
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
