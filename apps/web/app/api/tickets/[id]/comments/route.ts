import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { sendFeedbackCommentDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'
import { unitColoursFor } from '@/lib/orbat/unit-colour'


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
    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) }, { projection: { visibility: 1, isDeleted: 1, authorId: 1, isAnonymous: 1, title: 1 } })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { content, parentId } = await req.json().catch(() => ({}))
    if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    // A reply has to answer a live comment on this same ticket. Checked here
    // rather than trusted: the id comes from the browser, and a reply hung off
    // another ticket's comment would be unreachable from either thread.
    let parent: CommunityTicketComment | null = null
    if (parentId) {
        if (typeof parentId !== 'string' || !ObjectId.isValid(parentId)) {
            return NextResponse.json({ error: 'Invalid parentId' }, { status: 400 })
        }
        parent = await Db.communityTicketComments.findOne({
            _id: new ObjectId(parentId), ticketId: new ObjectId(id), isDeleted: { $ne: true },
        })
        if (!parent) return NextResponse.json({ error: 'The comment you are replying to no longer exists.' }, { status: 404 })
    }

    const now = new Date()
    const commenterName = me.guild.displayName ?? me.username
    const comment: CommunityTicketComment = {
        _id: new ObjectId(),
        ticketId: new ObjectId(id),
        authorId: me.id,
        authorName: commenterName,
        authorAvatarId: me.guild?.avatar ?? me.avatar ?? undefined,
        ...(parent ? { parentId: parent._id } : {}),
        content: content.trim(),
        createdAt: now,
        isEdited: false,
        isDeleted: false,
        upvotes: [],
        downvotes: [],
        voteScore: 0,
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
                    actorName: commenterName,
                    timestamp: now,
                } as CommunityTicketActivity,
            },
        }
    )

    // Notify ticket author if they're not the one commenting and ticket isn't anonymous
    if (!ticket.isAnonymous && ticket.authorId && ticket.authorId !== me.id) {
        const actionUrl = `/tickets/${id}`
        const notifTitle = `New comment on your ticket: "${ticket.title}"`
        await createNotification({
            userId: ticket.authorId,
            type: 'ticket_comment',
            title: notifTitle,
            body: `${commenterName} commented on your ticket.`,
            actionUrl,
            relatedId: id,
        }).catch(() => {})
        await sendFeedbackCommentDM(ticket.authorId, ticket.title, commenterName, actionUrl).catch(() => {})
    }

    // Tell the person being answered — unless that is the commenter, or the
    // ticket's author, who has just been told by the block above.
    if (parent && parent.authorId !== me.id && !(ticket.authorId === parent.authorId && !ticket.isAnonymous)) {
        await createNotification({
            userId: parent.authorId,
            type: 'ticket_comment',
            title: `${commenterName} replied to your comment`,
            body: `On the ticket "${ticket.title}".`,
            actionUrl: `/tickets/${id}`,
            relatedId: id,
        }).catch(() => {})
    }

    const colours = await unitColoursFor([me.id])
    return NextResponse.json({ ...comment, authorColor: colours.get(me.id) ?? null }, { status: 201 })
}
