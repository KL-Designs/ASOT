import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { isStars, summarise } from '@/lib/loadout/rating'

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
 * Recompute the two denormalised fields from the collection that owns the
 * truth. Reading the rows rather than running a `$group`: a kit gathers tens of
 * ratings, not millions, and `summarise` is the same function the tests pin
 * the maths with.
 */
async function recount(loadoutId: ObjectId) {
    const rows = await Db.loadoutRatings
        .find({ loadoutId }, { projection: { stars: 1 } })
        .toArray()
    const { avg, count } = summarise(rows.map(row => row.stars))
    await Db.loadouts.updateOne({ _id: loadoutId }, { $set: { ratingAvg: avg, ratingCount: count } })
    return { avg, count }
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
        await Db.loadoutRatings.deleteOne({ loadoutId, userId: me.id })
        const { avg, count } = await recount(loadoutId)
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
    await Db.loadoutRatings.updateOne(
        { loadoutId, userId: me.id },
        { $set: { stars: body.stars, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
    )

    const { avg, count } = await recount(loadoutId)
    return NextResponse.json({ mine: body.stars, avg, count })
}
