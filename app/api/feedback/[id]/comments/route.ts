import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { createNotification } from '@/lib/notifications'
import { sendFeedbackCommentDM } from '@/lib/discord/bot'


export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const comments = await Db.feedbackComments
        .find({ feedbackId: new ObjectId(id) })
        .sort({ createdAt: 1 })
        .toArray()

    return NextResponse.json(comments)
}


export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const item = await Db.feedback.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()
    const content = body.content?.trim()
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const commenterName = me.guild?.displayName ?? me.username

    const comment: FeedbackComment = {
        _id: new ObjectId(),
        feedbackId: new ObjectId(id),
        authorId: me.id,
        authorName: commenterName,
        content,
        createdAt: new Date(),
    }

    await Db.feedbackComments.insertOne(comment)
    await Db.feedback.updateOne({ _id: new ObjectId(id) }, { $inc: { commentCount: 1 } })

    // Notify the feedback author if someone else commented
    if (item.authorId && item.authorId !== me.id) {
        const actionUrl = `/feedback/${id}`
        await createNotification({
            userId: item.authorId,
            type: 'task_assigned',
            title: 'New comment on your feedback',
            body: `${commenterName} commented on "${item.title}"`,
            actionUrl,
        })
        sendFeedbackCommentDM(item.authorId, item.title, commenterName, actionUrl).catch(() => null)
    }

    return NextResponse.json(comment, { status: 201 })
}
