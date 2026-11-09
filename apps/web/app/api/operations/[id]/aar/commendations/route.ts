import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { toBoardUser } from '@/lib/attendance/board-user'
import { canCommend, sectionOf } from '@/lib/operations/aar-access'
import { actorName, loadAarContext } from '@/lib/operations/aar-context'

/**
 * Row 330: commendations on an operation's AAR, always present whether the
 * Mission AAR block is on or off.
 *
 * POST `{ targetType: 'member', targetUserId, wording }` or
 *      `{ targetType: 'callsign', targetName, wording }` — staff on the night
 *      (section leads, platoon and company HQ) and the staff overrides.
 * DELETE `{ id }` — your own, or any for J4, the mission maker and `aar.manage`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const operationId = new ObjectId(id)
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await loadAarContext(operationId, me)
    if (!ctx.open) return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    if (!canCommend(ctx.roster, me.id, ctx.standing)) return NextResponse.json({ error: 'Only staff on the night can write commendations' }, { status: 403 })

    const body = await req.json().catch(() => null) as { targetType?: string; targetUserId?: string; targetName?: string; wording?: string } | null
    const wording = typeof body?.wording === 'string' ? body.wording.trim().slice(0, 2000) : ''
    if (!wording) return NextResponse.json({ error: 'Write the commendation first' }, { status: 400 })

    let targetName = ''
    let targetUserId: string | undefined
    if (body?.targetType === 'member') {
        if (typeof body.targetUserId !== 'string') return NextResponse.json({ error: 'Pick a member' }, { status: 400 })
        const u = await Db.users.findOne({ id: body.targetUserId })
        if (!u) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
        targetUserId = u.id
        targetName = toBoardUser(u, u.id).displayName
    } else if (body?.targetType === 'callsign') {
        targetName = typeof body.targetName === 'string' ? body.targetName.trim() : ''
        if (!ctx.roster.some(s => s.sectionTitle === targetName)) return NextResponse.json({ error: 'Pick a call sign from this operation' }, { status: 400 })
    } else {
        return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
    }

    const doc: OperationCommendation = {
        operationId, authorId: me.id, authorName: actorName(me), authorSection: sectionOf(ctx.roster, me.id),
        targetType: body.targetType, ...(targetUserId ? { targetUserId } : {}), targetName, wording, createdAt: new Date(),
    }
    const result = await Db.operationCommendations.insertOne(doc)
    await logAction({
        action: 'operations.aar.commendation', category: 'operation', performedBy: me.id, performedByName: doc.authorName,
        entityType: 'operationCommendation', entityId: String(result.insertedId), actionUrl: `/operations/${id}/aar`, target: targetName,
    })
    return NextResponse.json({ ok: true, id: String(result.insertedId) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const operationId = new ObjectId(id)
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null) as { id?: string } | null
    if (!body?.id || !ObjectId.isValid(body.id)) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
    const existing = await Db.operationCommendations.findOne({ _id: new ObjectId(body.id), operationId })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ctx = await loadAarContext(operationId, me)
    const mayDelete = existing.authorId === me.id || ctx.standing.canManageAll || ctx.standing.isJ4 || ctx.standing.isMissionMaker
    if (!mayDelete) return NextResponse.json({ error: 'Not yours to remove' }, { status: 403 })

    await Db.operationCommendations.deleteOne({ _id: existing._id })
    await logAction({
        action: 'operations.aar.commendationDelete', category: 'operation', performedBy: me.id, performedByName: actorName(me),
        entityType: 'operationCommendation', entityId: body.id, actionUrl: `/operations/${id}/aar`, target: existing.targetName,
        before: { wording: existing.wording, authorName: existing.authorName },
    })
    return NextResponse.json({ ok: true })
}
