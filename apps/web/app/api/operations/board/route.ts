import { NextRequest, NextResponse } from 'next/server'
import { ObjectId, type Filter } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import {
    escapeRegex, fillMonths, monthKey, parseBoardFilter, PAGE_SIZE,
    type BoardFilter, type BoardOperation, type MonthBucket,
} from '@/lib/operations/board'

/**
 * Everything the public operations board draws, in one request.
 *
 * Separate from `/api/operations` on purpose. That endpoint is a plain list with
 * four other callers — the dashboard, the J2 tab, the calendar modal — and this
 * one needs a shape none of them want: attendance joined in, facet counts across
 * the whole collection, a month histogram, and paging. Widening the shared
 * endpoint to carry all of that would make every one of those callers pay for it.
 *
 * ## What is deliberately not here
 *
 * **Operations in development.** They are on nobody's calendar and nobody can
 * answer them, so they have no business on the page whose job is answering. The
 * count reaches staff as a single line pointing at the J2 dashboard, and only
 * with the permission — the operations themselves never leave it.
 *
 * ## Past and future are split by the clock, not by status
 *
 * `status` drifts: an operation that ran last month can sit at `Upcoming`
 * because nobody advanced it. Partitioning on the date means a mission that has
 * happened is in the archive whatever its status says, which is what a reader
 * means by "past". Status still decides how a card is labelled.
 */

interface FacetCount { value: string; label: string; count: number }

export async function GET(req: NextRequest) {
    const filter = parseBoardFilter(req.nextUrl.searchParams)

    // Signed out is the normal case for this page — it is public. Everything
    // personal degrades to absent rather than erroring.
    let me: User | null = null
    try { me = await client.fetchMe() } catch { me = null }

    const now = new Date()

    /** Common to every query here: not deleted, and never in development. */
    const base: Filter<Operation> = {
        deletedAt: { $exists: false },
        status: { $ne: 'In Development' },
    }

    // ── "Ones I was on" ───────────────────────────────────────────────────────
    //
    // Resolved to a set of ids first rather than joined, because the archive
    // query has to stay a plain indexed find on `operations` for paging to be
    // cheap. Confirmed, not RSVP'd: the question is which ones you actually flew.
    let mineIds: ObjectId[] | null = null
    let mineCount = 0
    if (me) {
        const rows = await Db.operationAttendance
            .find(
                { records: { $elemMatch: { userId: me.id, confirmed: true } } },
                { projection: { operationId: 1 } },
            )
            .toArray()
        mineIds = rows.map(r => r.operationId)
        mineCount = mineIds.length
    }

    /**
     * The archive match, optionally leaving one facet out.
     *
     * A facet's own count has to ignore that facet's current selection —
     * otherwise "Unit" reads `1-3 Support · 142` and every other unit reads
     * zero, which tells you nothing about what switching would give you.
     */
    function archiveMatch(f: BoardFilter, exclude?: 'campaign' | 'unit' | 'terrain' | 'date'): Filter<Operation> {
        const query: Filter<Operation> = { ...base, date: { $lt: now } }

        if (f.q) query.title = { $regex: escapeRegex(f.q), $options: 'i' }
        if (f.campaignId && exclude !== 'campaign') {
            try { query.campaignId = new ObjectId(f.campaignId) } catch { /* not an id — no match narrowing */ }
        }
        if (f.unit && exclude !== 'unit') query.assignedPlatoons = f.unit
        if (f.terrain && exclude !== 'terrain') query.mapWorld = f.terrain
        if (f.mine && mineIds) query._id = { $in: mineIds }

        if (exclude !== 'date' && (f.from || f.to)) {
            const range: Record<string, Date> = { $lt: now }
            if (f.from) range.$gte = new Date(`${f.from}-01T00:00:00.000Z`)
            if (f.to) {
                const [y, m] = f.to.split('-').map(Number)
                // Exclusive upper bound at the start of the next month, so the
                // last month of a selected range is included whole.
                range.$lt = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
            }
            query.date = range as Filter<Operation>['date']
        }
        return query
    }

    // ── The queries ───────────────────────────────────────────────────────────

    const archiveQuery = archiveMatch(filter)

    const [upcomingDocs, pastDocs, total, campaignDocs, missionDocs, histRows, unitRows, terrainRows, campFacetRows]
        = await Promise.all([
            // The band. Only on the first page — it does not change while paging
            // the archive beneath it.
            filter.skip === 0
                ? Db.operations
                    .find({ ...base, date: { $gte: now } }, { projection: LIST_FIELDS })
                    .sort({ date: 1 })
                    .limit(12)
                    .toArray()
                : Promise.resolve([]),

            Db.operations
                .find(archiveQuery, { projection: LIST_FIELDS })
                .sort({ date: -1 })
                .skip(filter.skip)
                .limit(PAGE_SIZE)
                .toArray(),

            Db.operations.countDocuments(archiveQuery),

            Db.operationCampaigns
                .find({ isDeleted: { $ne: true } }, { projection: { name: 1 } })
                .toArray(),

            Db.campaignMissions
                .find({ isDeleted: { $ne: true } }, { projection: { campaignId: 1, name: 1, sequence: 1 } })
                .toArray(),

            // The histogram ignores the range selection: the bars outside it are
            // dimmed, not removed, so you can still see where the rest of the
            // history sits while a range is applied.
            Db.operations.aggregate<{ _id: string; count: number }>([
                { $match: archiveMatch(filter, 'date') },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, count: { $sum: 1 } } },
            ]).toArray(),

            Db.operations.aggregate<{ _id: string; count: number }>([
                { $match: archiveMatch(filter, 'unit') },
                { $unwind: '$assignedPlatoons' },
                { $group: { _id: '$assignedPlatoons', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]).toArray(),

            Db.operations.aggregate<{ _id: string; count: number }>([
                { $match: { ...archiveMatch(filter, 'terrain'), mapWorld: { $nin: [null, ''] } } },
                { $group: { _id: '$mapWorld', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]).toArray(),

            Db.operations.aggregate<{ _id: ObjectId; count: number }>([
                { $match: { ...archiveMatch(filter, 'campaign'), campaignId: { $ne: null } } },
                { $group: { _id: '$campaignId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]).toArray(),
        ])

    // ── Attendance for the operations actually on screen ──────────────────────
    //
    // Bounded by the page rather than joined across the collection: a $lookup
    // here would read every attendance document to render twenty rows.
    const shown = [...upcomingDocs, ...pastDocs].map(d => d._id)
    const attendance = shown.length === 0 ? [] : await Db.operationAttendance.aggregate<{
        operationId: ObjectId
        attending: number
        turnout: number
        mine: { rsvp: 'attending' | 'not_attending' | null; confirmed: boolean } | null
    }>([
        { $match: { operationId: { $in: shown } } },
        {
            $project: {
                operationId: 1,
                attending: {
                    $size: { $filter: { input: { $ifNull: ['$records', []] }, cond: { $eq: ['$$this.rsvp', 'attending'] } } },
                },
                turnout: {
                    $size: { $filter: { input: { $ifNull: ['$records', []] }, cond: { $eq: ['$$this.confirmed', true] } } },
                },
                mine: me
                    ? {
                        $let: {
                            vars: {
                                r: {
                                    $first: {
                                        $filter: {
                                            input: { $ifNull: ['$records', []] },
                                            cond: { $eq: ['$$this.userId', me.id] },
                                        },
                                    },
                                },
                            },
                            in: {
                                $cond: [
                                    { $eq: ['$$r', null] },
                                    null,
                                    { rsvp: '$$r.rsvp', confirmed: { $ifNull: ['$$r.confirmed', false] } },
                                ],
                            },
                        },
                    }
                    : null,
            },
        },
    ]).toArray()

    const byOp = new Map(attendance.map(a => [a.operationId.toString(), a]))

    const shape = (doc: WithId): BoardOperation => {
        const att = byOp.get(doc._id.toString())
        return {
            id: doc._id.toString(),
            title: doc.title,
            date: new Date(doc.date).toISOString(),
            status: doc.status,
            units: doc.assignedPlatoons ?? [],
            terrain: doc.mapWorld || undefined,
            coverImage: doc.coverImage || undefined,
            campaignId: doc.campaignId?.toString(),
            campaignMissionId: doc.campaignMissionId,
            daySlot: doc.daySlot,
            attending: att?.attending ?? 0,
            turnout: att?.turnout ?? 0,
            mine: att?.mine ?? null,
        }
    }

    // ── Staff line ────────────────────────────────────────────────────────────
    //
    // A count and nothing else. The operations themselves stay in the J2
    // dashboard; this only says there is something to go and look at.
    let staff: { inDevelopment: number } | null = null
    if (me && client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) {
        staff = {
            inDevelopment: await Db.operations.countDocuments({
                deletedAt: { $exists: false },
                status: 'In Development',
            }),
        }
    }

    // The last thing we ran, for the standing-by state to name.
    const lastFlown = upcomingDocs.length === 0 && filter.skip === 0
        ? await Db.operations
            .find({ ...base, date: { $lt: now } }, { projection: { title: 1, date: 1 } })
            .sort({ date: -1 })
            .limit(1)
            .toArray()
        : []

    const campaignName = new Map(campaignDocs.map(c => [c._id.toString(), c.name]))
    const histogram: MonthBucket[] = fillMonths(
        histRows.map(r => ({ month: r._id, count: r.count })),
    )

    return NextResponse.json({
        upcoming: upcomingDocs.map(shape),
        past: pastDocs.map(shape),
        total,
        pageSize: PAGE_SIZE,
        histogram,
        facets: {
            campaigns: campFacetRows
                .map<FacetCount>(r => ({
                    value: r._id.toString(),
                    label: campaignName.get(r._id.toString()) ?? 'Unknown campaign',
                    count: r.count,
                }))
                .filter(f => f.label !== 'Unknown campaign'),
            units: unitRows.map<FacetCount>(r => ({ value: r._id, label: r._id, count: r.count })),
            terrains: terrainRows.map<FacetCount>(r => ({ value: r._id, label: r._id, count: r.count })),
            mine: mineCount,
        },
        campaigns: campaignDocs.map(c => ({ id: c._id.toString(), name: c.name })),
        missions: missionDocs.map(m => ({
            id: m._id!.toString(),
            campaignId: m.campaignId,
            name: m.name,
            sequence: m.sequence,
        })),
        lastFlown: lastFlown[0]
            ? { title: lastFlown[0].title, date: new Date(lastFlown[0].date).toISOString() }
            : null,
        signedIn: !!me,
        staff,
    })
}

/**
 * What the board actually draws. Allow-listed rather than excluded by name: an
 * operation document carries J2 and J6 internal fields, this endpoint is
 * reachable signed out, and a field added to the model later must not become
 * public by default.
 */
const LIST_FIELDS = {
    title: 1, date: 1, status: 1, assignedPlatoons: 1, mapWorld: 1,
    campaignId: 1, campaignMissionId: 1, daySlot: 1, themeColor: 1, coverImage: 1,
} as const

type WithId = {
    _id: ObjectId
    title: string
    date: Date | string
    status?: Operation['status']
    assignedPlatoons?: string[]
    mapWorld?: string
    coverImage?: string
    campaignId?: ObjectId
    campaignMissionId?: string
    daySlot?: 'saturday' | 'sunday'
}
