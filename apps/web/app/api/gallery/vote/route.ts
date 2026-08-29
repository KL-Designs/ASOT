import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { voteDelta, type VoteValue } from '@/lib/gallery/votes'

/**
 * What the unit thinks of a photograph.
 *
 * Voting is not a permission key — it is "any authenticated member", the same
 * bar as every other logged-in action on the public site. Guests see the bar
 * and are prompted to log in.
 *
 * The counters on gallery_media are denormalised so a grid of 48 tiles never
 * aggregates gallery_votes. That is only safe if the delta is applied in one
 * atomic write, which is why the update below is an aggregation pipeline rather
 * than a read followed by an $inc — the same fix
 * app/api/loadouts/[id]/rating/route.ts documents, where a read-then-write let
 * two concurrent raters permanently desync the count.
 *
 * `$max: [0, ...]` floors both counters, so a double-submitted withdrawal can
 * never drive one negative.
 */
export async function PUT(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 })

    const { mediaId, value } = await request.json().catch(() => ({}))
    if (!ObjectId.isValid(String(mediaId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (value !== 1 && value !== -1 && value !== null) {
        return NextResponse.json({ error: 'A vote is 1, -1 or null' }, { status: 400 })
    }

    const _id = new ObjectId(String(mediaId))

    // `status: 'live'` is part of the query, not a check after it: unpublished
    // media is not addressable, and a 403 would confirm it exists.
    const media = await Db.galleryMedia.findOne({ _id, status: 'live' }, { projection: { _id: 1 } })
    if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    /* findOneAndDelete hands back the row it removed in the same operation that
       removes it, so the previous value comes from the write rather than from a
       read a moment earlier. */
    const removed = await Db.galleryVotes.findOneAndDelete({ mediaId: _id, userId: me.id })
    const previous = (removed?.value ?? null) as VoteValue | null

    // Clicking the vote you already hold withdraws it — the obvious meaning of
    // pressing an already-pressed button, and it saves a separate control.
    const next: VoteValue | null = value === null || value === previous ? null : (value as VoteValue)

    if (next !== null) {
        await Db.galleryVotes.insertOne({ mediaId: _id, userId: me.id, value: next, at: new Date() } as GalleryVote)
    }

    const delta = voteDelta(previous, next)

    const updated = await Db.galleryMedia.findOneAndUpdate(
        { _id },
        [{
            $set: {
                up: { $max: [0, { $add: [{ $ifNull: ['$up', 0] }, delta.up] }] },
                down: { $max: [0, { $add: [{ $ifNull: ['$down', 0] }, delta.down] }] },
            },
        }],
        { returnDocument: 'after', projection: { up: 1, down: 1 } },
    )

    return NextResponse.json({ up: updated?.up ?? 0, down: updated?.down ?? 0, mine: next })
}

/** The caller's own votes, so the gallery can show which button is pressed.
 *  One request for the whole page rather than one per tile. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ votes: {} })

    const votes = await Db.galleryVotes.find({ userId: me.id }).toArray()
    return NextResponse.json({
        votes: Object.fromEntries(votes.map(v => [v.mediaId.toString(), v.value])),
    })
}
