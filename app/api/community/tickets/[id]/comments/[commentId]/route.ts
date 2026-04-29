import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

type RouteParams = { params: Promise<{ id: string; commentId: string }> }


export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, commentId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(commentId)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const comment = await Db.communityTicketComments.findOne({ _id: new ObjectId(commentId), ticketId: new ObjectId(id) })
    if (!comment || comment.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (comment.authorId !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { content } = await req.json().catch(() => ({}))
    if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const now = new Date()
    await Db.communityTicketComments.updateOne(
        { _id: new ObjectId(commentId) },
        { $set: { content: content.trim(), updatedAt: now, isEdited: true } }
    )

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $push: {
                activityLog: {
                    action: 'comment_edited',
                    actorId: me.id,
                    actorName: me.guild.displayName ?? me.username,
                    timestamp: now,
                } as CommunityTicketActivity,
            },
        }
    )

    return NextResponse.json({ ...comment, content: content.trim(), updatedAt: now, isEdited: true })
}


export async function DELETE(_req: NextRequest, { params }: RouteParams) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, commentId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(commentId)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const comment = await Db.communityTicketComments.findOne({ _id: new ObjectId(commentId), ticketId: new ObjectId(id) })
    if (!comment || comment.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (comment.authorId !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    await Db.communityTicketComments.updateOne(
        { _id: new ObjectId(commentId) },
        { $set: { isDeleted: true, content: '[deleted]' } }
    )

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $inc: { commentCount: -1 },
            $push: {
                activityLog: {
                    action: 'comment_deleted',
                    actorId: me.id,
                    actorName: me.guild.displayName ?? me.username,
                    timestamp: now,
                } as CommunityTicketActivity,
            },
        }
    )

    return NextResponse.json({ success: true })
}
