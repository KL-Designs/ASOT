import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import { loadEntryInScope } from '@/lib/intel/report-db'
import { intelGate } from '../../gate'

/**
 * `/api/operations/{id}/intel/{entryId}/comments` — staff comments on an
 * entry. Staff only, both ways: players see the assessment once it is
 * released, never the discussion behind it. POST `{ body }`; DELETE
 * `?commentId=` (your own, or any with `intel.manage`).
 */
type Params = { params: Promise<{ id: string; entryId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate
    if (!ctx.staff) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 4000) : ''
    if (!text) return NextResponse.json({ error: 'Empty comment' }, { status: 400 })

    const name = actorName(me)
    const res = await Db.intelComments.insertOne({ entryId: entry._id, authorId: me.id, authorName: name, body: text, createdAt: new Date(), deletedAt: null })
    await logAction({
        action: 'intel.comment.create',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        entityType: 'intelEntry',
        entityId: entryId,
        actionUrl: `/operations/${id}`,
        details: { operationId: id },
    })
    return NextResponse.json({ ok: true, id: String(res.insertedId) })
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate
    if (!ctx.staff) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const commentId = req.nextUrl.searchParams.get('commentId') ?? ''
    if (!ObjectId.isValid(commentId)) return NextResponse.json({ error: 'Invalid comment' }, { status: 400 })
    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const comment = await Db.intelComments.findOne({ _id: new ObjectId(commentId), entryId: entry._id })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.authorId !== me.id && !ctx.standing.canManage) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    await Db.intelComments.updateOne({ _id: comment._id }, { $set: { deletedAt: new Date() } })
    await logAction({
        action: 'intel.comment.delete',
        category: 'operation',
        performedBy: me.id,
        performedByName: actorName(me),
        entityType: 'intelEntry',
        entityId: entryId,
        actionUrl: `/operations/${id}`,
        details: { operationId: id, commentId },
    })
    return NextResponse.json({ ok: true })
}
