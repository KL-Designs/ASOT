import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { isStars } from '@/lib/loadout/rating'

/**
 * What the unit thinks of a shared kit.
 *
 * `PUT` only, and deliberately no `GET`: both pages that show a rating are
 * server components and read Mongo directly, so an endpoint to fetch one would
 * have no caller.
 *
 * Ratings are anonymous. Only the average and the count ever leave this file —
 * no response, here or anywhere, says who rated a kit, including to its owner.
 */

/**
 * Applies a rating delta to the loadout's denormalised fields in one atomic
 * aggregation-pipeline update, so `ratingAvg` is derived inside the same write
 * that applies the delta rather than computed from a value read a moment
 * earlier — the read-then-write shape that let two concurrent raters
 * permanently desync the count (see the finding this replaces). The first
 * stage `$inc`s `ratingSum`/`ratingCount` (via `$add` over `$ifNull`-guarded
 * current values, since both are absent on a never-rated kit); the second
 * derives `ratingAvg` from the fields the first stage just wrote. `ratingCount`
 * is floored at 0 with `$max` so a double-withdrawal race can never drive it
 * negative.
 */
async function applyRatingDelta(loadoutId: ObjectId, deltaSum: number, deltaCount: number) {
    const updated = await Db.loadouts.findOneAndUpdate(
        { _id: loadoutId },
        [
            {
                $set: {
                    ratingSum: { $add: [{ $ifNull: ['$ratingSum', 0] }, deltaSum] },
                    ratingCount: { $max: [0, { $add: [{ $ifNull: ['$ratingCount', 0] }, deltaCount] }] },
                },
            },
            {
                $set: {
                    ratingAvg: {
                        $cond: [
                            { $gt: ['$ratingCount', 0] },
                            { $round: [{ $divide: ['$ratingSum', '$ratingCount'] }, 2] },
                            0,
                        ],
                    },
                },
            },
        ],
        { returnDocument: 'after', projection: { ratingAvg: 1, ratingCount: 1 } },
    )
    return { avg: updated?.ratingAvg ?? 0, count: updated?.ratingCount ?? 0 }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const loadoutId = new ObjectId(id)

    // `shared: true` is part of the query, not a check after it: an unshared
    // kit is not addressable by anyone but its owner, and a 403 would confirm
    // it exists.
    const doc = await Db.loadouts.findOne({ _id: loadoutId, shared: true }, { projection: { userId: 1 } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.userId === me.id) {
        return NextResponse.json({ error: 'You cannot rate your own kit.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)

    // An explicit null withdraws a rating. Distinct from a missing field,
    // which is a malformed request.
    if (body?.stars === null) {
        // `findOneAndDelete` hands back the row it removed atomically, so the
        // delta comes from the same operation that reads the previous value —
        // no separate read that a concurrent write could invalidate. No row
        // (an already-withdrawn or never-cast rating) is a no-op: both deltas
        // stay 0 rather than under-counting the loadout.
        const previous = await Db.loadoutRatings.findOneAndDelete({ loadoutId, userId: me.id })
        const deltaCount = previous ? -1 : 0
        const deltaSum = previous ? -previous.stars : 0
        const { avg, count } = await applyRatingDelta(loadoutId, deltaSum, deltaCount)
        return NextResponse.json({ mine: null, avg, count })
    }

    if (!isStars(body?.stars)) {
        return NextResponse.json(
            { error: 'stars must be a whole number from 1 to 5, or null to withdraw.' },
            { status: 400 },
        )
    }

    const now = new Date()
    // Upsert against the unique `{ loadoutId, userId }` index rather than
    // checking for an existing row first — the index is what enforces one
    // rating per member, so rating again is a change, not a second vote.
    // `returnDocument: 'before'` hands back the member's previous row (or
    // `null` on a fresh insert) from the same atomic operation that writes the
    // new one, so the delta below reflects what was actually there rather than
    // a value fetched a moment earlier.
    const previous = await Db.loadoutRatings.findOneAndUpdate(
        { loadoutId, userId: me.id },
        { $set: { stars: body.stars, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: 'before' },
    )
    const deltaCount = previous ? 0 : 1
    const deltaSum = body.stars - (previous?.stars ?? 0)

    const { avg, count } = await applyRatingDelta(loadoutId, deltaSum, deltaCount)
    return NextResponse.json({ mine: body.stars, avg, count })
}
