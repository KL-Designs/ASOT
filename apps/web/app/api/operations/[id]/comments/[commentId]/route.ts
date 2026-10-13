import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { unitColoursFor } from '@/lib/orbat/unit-colour'
import { commentViewer, toView, visibleOperation } from '@/lib/operations/comments'

type RouteParams = { params: Promise<{ id: string; commentId: string }> }

/** The comment, provided the viewer may see the operation it sits under —
 *  the same visibility rule the thread itself applies. */
async function find(params: RouteParams['params'], viewer: NonNullable<Awaited<ReturnType<typeof commentViewer>>>) {
    const { id, commentId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(commentId)) return null
    if (!(await visibleOperation(id, viewer))) return null
    return Db.operationComments.findOne({ _id: new ObjectId(commentId), operationId: new ObjectId(id) })
}

/** Edit — the author only. A moderator can remove a comment but not put words
 *  in somebody else's mouth. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const viewer = await commentViewer()
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await find(params, viewer)
    if (!comment || comment.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.authorId !== viewer.me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })
    if (content.length > 4000) return NextResponse.json({ error: 'Comments can be at most 4000 characters.' }, { status: 400 })

    const updatedAt = new Date()
    await Db.operationComments.updateOne({ _id: comment._id }, { $set: { content, updatedAt, isEdited: true } })

    const colours = await unitColoursFor([comment.authorId])
    return NextResponse.json(toView({ ...comment, content, updatedAt, isEdited: true }, colours.get(comment.authorId) ?? null))
}

/** Soft delete — the author, or anybody who can edit operations. The record
 *  stays so replies beneath it keep their place in the thread. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
    const viewer = await commentViewer()
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await find(params, viewer)
    if (!comment || comment.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.authorId !== viewer.me.id && !viewer.canModerate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.operationComments.updateOne({ _id: comment._id }, { $set: { isDeleted: true, updatedAt: new Date() } })
    return NextResponse.json({ success: true })
}
