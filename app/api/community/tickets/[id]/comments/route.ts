import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) }, { projection: { visibility: 1, isDeleted: 1 } })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const comments = await Db.communityTicketComments
        .find({ ticketId: new ObjectId(id), isDeleted: { $ne: true } })
        .sort({ createdAt: 1 })
        .toArray()

    return NextResponse.json(comments)
}


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) }, { projection: { visibility: 1, isDeleted: 1 } })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { content } = await req.json().catch(() => ({}))
    if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const now = new Date()
    const comment: CommunityTicketComment = {
        _id: new ObjectId(),
        ticketId: new ObjectId(id),
        authorId: me.id,
        authorName: me.guild.displayName ?? me.username,
        authorAvatarId: me.guild?.avatar ?? me.avatar ?? undefined,
        content: content.trim(),
        createdAt: now,
        isEdited: false,
        isDeleted: false,
    }

    await Db.communityTicketComments.insertOne(comment)
    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $inc: { commentCount: 1 },
            $set: { updatedAt: now },
            $push: {
                activityLog: {
                    action: 'comment_added',
                    actorId: me.id,
                    actorName: me.guild.displayName ?? me.username,
                    timestamp: now,
                } as CommunityTicketActivity,
            },
        }
    )

    return NextResponse.json(comment, { status: 201 })
}
