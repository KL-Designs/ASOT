import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

type RouteParams = { params: Promise<{ id: string; commentId: string }> }


export async function POST(req: NextRequest, { params }: RouteParams) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, commentId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(commentId)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const comment = await Db.communityTicketComments.findOne({
        _id: new ObjectId(commentId),
        ticketId: new ObjectId(id),
        isDeleted: { $ne: true },
    })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Verify ticket access
    const ticket = await Db.communityTickets.findOne(
        { _id: new ObjectId(id) },
        { projection: { visibility: 1, isDeleted: 1 } }
    )
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { direction } = await req.json().catch(() => ({}))
    if (direction !== 'up' && direction !== 'down' && direction !== null) {
        return NextResponse.json({ error: 'direction must be "up", "down", or null' }, { status: 400 })
    }

    const uid = me.id
    const upvotes: string[] = comment.upvotes ?? []
    const downvotes: string[] = comment.downvotes ?? []
    const hasUp = upvotes.includes(uid)
    const hasDown = downvotes.includes(uid)

    let upPull = false, upPush = false, downPull = false, downPush = false
    if (direction === 'up') {
        if (hasUp) { upPull = true } else { upPush = true; downPull = hasDown }
    } else if (direction === 'down') {
        if (hasDown) { downPull = true } else { downPush = true; upPull = hasUp }
    } else {
        upPull = hasUp; downPull = hasDown
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
    if (Object.keys(pushOps).length) update.$push = pushOps

    if (Object.keys(update).length > 0) {
        await Db.communityTicketComments.updateOne({ _id: new ObjectId(commentId) }, update)
    }

    const updated = await Db.communityTicketComments.findOne(
        { _id: new ObjectId(commentId) },
        { projection: { upvotes: 1, downvotes: 1 } }
    )
    const newUp = updated?.upvotes ?? []
    const newDown = updated?.downvotes ?? []
    const voteScore = newUp.length - newDown.length
    await Db.communityTicketComments.updateOne({ _id: new ObjectId(commentId) }, { $set: { voteScore } })

    const myVote = newUp.includes(uid) ? 'up' : newDown.includes(uid) ? 'down' : null
    return NextResponse.json({ myVote, upvotes: newUp.length, downvotes: newDown.length, voteScore })
}
