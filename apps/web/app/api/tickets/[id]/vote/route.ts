import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { direction } = await req.json().catch(() => ({}))
    if (direction !== 'up' && direction !== 'down' && direction !== null) {
        return NextResponse.json({ error: 'direction must be "up", "down", or null' }, { status: 400 })
    }

    const uid = me.id
    const hasUp = ticket.upvotes.includes(uid)
    const hasDown = ticket.downvotes.includes(uid)

    let upPull = false, upPush = false, downPull = false, downPush = false

    if (direction === 'up') {
        if (hasUp) { upPull = true }       // toggle off
        else { upPush = true; downPull = hasDown } // switch or add
    } else if (direction === 'down') {
        if (hasDown) { downPull = true }
        else { downPush = true; upPull = hasUp }
    } else {
        // null = remove vote
        upPull = hasUp
        downPull = hasDown
    }

    const update: Record<string, unknown> = {}
    if (upPull || downPull) {
        update.$pull = {}
        if (upPull) (update.$pull as Record<string, unknown>).upvotes = uid
        if (downPull) (update.$pull as Record<string, unknown>).downvotes = uid
    }
    const pushOps: Record<string, unknown> = {}
    if (upPush) pushOps.upvotes = uid
    if (downPush) pushOps.downvotes = uid
    if (Object.keys(pushOps).length) {
        update.$push = pushOps
    }

    if (Object.keys(update).length > 0) {
        await Db.communityTickets.updateOne({ _id: new ObjectId(id) }, update)
    }

    const updated = await Db.communityTickets.findOne({ _id: new ObjectId(id) }, { projection: { upvotes: 1, downvotes: 1 } })
    const upvotes = updated?.upvotes ?? []
    const downvotes = updated?.downvotes ?? []
    const voteScore = upvotes.length - downvotes.length

    await Db.communityTickets.updateOne({ _id: new ObjectId(id) }, { $set: { voteScore } })

    const myVote = upvotes.includes(uid) ? 'up' : downvotes.includes(uid) ? 'down' : null
    return NextResponse.json({ myVote, upvotes: upvotes.length, downvotes: downvotes.length, voteScore })
}
