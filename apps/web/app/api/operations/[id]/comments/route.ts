import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendMeetingDM } from '@/lib/discord/bot'
import { unitColoursFor } from '@/lib/orbat/unit-colour'
import { commentViewer, readOperationComments, toView, visibleOperation } from '@/lib/operations/comments'

/**
 * `/api/operations/{id}/comments` — the thread under an operation's orders.
 *
 * Open to every member, to read and to write. A comment can be a reply
 * (`parentId`) and can ask for the mission maker to be notified
 * (`notifyMissionMaker`), which is how CHQ and staff put a question to whoever
 * wrote the orders without leaving the page the question is about.
 */

const MAX_LENGTH = 4000

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await commentViewer()
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const operation = await visibleOperation(id, viewer)
    if (!operation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
        comments: await readOperationComments(new ObjectId(id)),
        myId: viewer.me.id,
        canModerate: viewer.canModerate,
        // Null when the operation has no owner on record, or the owner is the
        // reader — the page hides the notify toggle rather than offering to
        // notify nobody, or to notify you about your own comment.
        missionMakerName: operation.ownedBy && operation.ownedBy !== viewer.me.id
            ? (operation.ownedByName ?? 'the mission maker')
            : null,
    })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await commentViewer()
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const operationId = new ObjectId(id)

    const operation = await visibleOperation(id, viewer)
    if (!operation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })
    if (content.length > MAX_LENGTH) {
        return NextResponse.json({ error: `Comments can be at most ${MAX_LENGTH} characters.` }, { status: 400 })
    }

    // A reply has to answer a live comment on this same operation.
    let parent: OperationComment | null = null
    if (body.parentId) {
        if (typeof body.parentId !== 'string' || !ObjectId.isValid(body.parentId)) {
            return NextResponse.json({ error: 'Invalid parentId' }, { status: 400 })
        }
        parent = await Db.operationComments.findOne({
            _id: new ObjectId(body.parentId), operationId, isDeleted: { $ne: true },
        })
        if (!parent) return NextResponse.json({ error: 'The comment you are replying to no longer exists.' }, { status: 404 })
    }

    const { me, name } = viewer
    // Only honoured when there is somebody to tell, and it is not the author.
    const notify = body.notifyMissionMaker === true && !!operation.ownedBy && operation.ownedBy !== me.id

    const comment: OperationComment = {
        _id: new ObjectId(),
        operationId,
        authorId: me.id,
        authorName: name,
        ...(parent ? { parentId: parent._id } : {}),
        content,
        ...(notify ? { notifiedMissionMaker: true } : {}),
        createdAt: new Date(),
        isEdited: false,
        isDeleted: false,
    }
    await Db.operationComments.insertOne(comment)

    const actionUrl = `/operations/${id}#comments`
    const title = operation.title || 'an operation'
    const excerpt = content.length > 180 ? `${content.slice(0, 180)}…` : content

    if (notify && operation.ownedBy) {
        const notifTitle = `Question on your orders: ${title}`
        const notifBody = `**${name}** asked on **${title}**:\n\n${excerpt}`
        await createNotification({ userId: operation.ownedBy, type: 'system', title: notifTitle, body: notifBody, actionUrl, relatedId: id }).catch(() => {})
        sendMeetingDM(operation.ownedBy, notifTitle, notifBody, actionUrl).catch(() => null)
    }

    // Tell the person being answered, unless that is the author or the
    // mission maker who has just been told above.
    if (parent && parent.authorId !== me.id && !(notify && parent.authorId === operation.ownedBy)) {
        await createNotification({
            userId: parent.authorId,
            type: 'system',
            title: `${name} replied to your comment`,
            body: `On the orders for **${title}**:\n\n${excerpt}`,
            actionUrl,
            relatedId: id,
        }).catch(() => {})
    }

    const colours = await unitColoursFor([me.id])
    return NextResponse.json(toView(comment, colours.get(me.id) ?? null), { status: 201 })
}
