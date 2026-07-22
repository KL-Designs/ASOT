import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { createNotification } from '@/lib/notifications'
import { sendBoardCardAssignedDM } from '@/lib/discord/bot'


function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function authMember(department: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) return null
    return me
}


// ── PATCH /api/admin/board/cards/[id] ────────────────────────────────────────
// Body: { columnId?, order?, title?, description?, assigneeId?, assigneeName?, linkedTaskId? }
// columnId+order together = a move; other fields = an edit. Both may be sent at once.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const card = await Db.boardCards.findOne({ _id: objectId })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    const me = await authMember(card.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Partial<BoardCard> = {}
    let targetColumn: BoardColumn | null = null

    if (typeof body.columnId === 'string') {
        let columnObjectId: ObjectId
        try { columnObjectId = new ObjectId(body.columnId) } catch { return NextResponse.json({ error: 'Invalid columnId' }, { status: 400 }) }
        targetColumn = await Db.boardColumns.findOne({ _id: columnObjectId, department: card.department })
        if (!targetColumn) return NextResponse.json({ error: 'Column not found' }, { status: 404 })
        updates.columnId = columnObjectId
    }
    if (typeof body.order === 'number') updates.order = body.order
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
    if ('description' in body) updates.description = typeof body.description === 'string' ? body.description.trim() || undefined : undefined
    if ('linkedTaskId' in body) {
        if (body.linkedTaskId === null) {
            updates.linkedTaskId = undefined
        } else if (typeof body.linkedTaskId === 'string') {
            try { updates.linkedTaskId = new ObjectId(body.linkedTaskId) } catch { return NextResponse.json({ error: 'Invalid linkedTaskId' }, { status: 400 }) }
        }
    }

    const wasReassigned = 'assigneeId' in body && body.assigneeId !== card.assigneeId
    if ('assigneeId' in body) {
        updates.assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : undefined
        updates.assigneeName = typeof body.assigneeName === 'string' ? body.assigneeName : undefined
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    // Mongo rejects $set with an explicit `undefined` value — strip keys that were cleared.
    const setDoc: Record<string, unknown> = {}
    const unsetDoc: Record<string, ''> = {}
    for (const [k, v] of Object.entries(updates)) {
        if (v === undefined) unsetDoc[k] = ''
        else setDoc[k] = v
    }
    await Db.boardCards.updateOne(
        { _id: objectId },
        { ...(Object.keys(setDoc).length ? { $set: setDoc } : {}), ...(Object.keys(unsetDoc).length ? { $unset: unsetDoc } : {}) },
    )

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const isMove = !!targetColumn
    logAction({
        action: isMove ? 'board.card.move' : 'board.card.edit',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: card.department,
        entityType: 'card',
        entityId: id,
        target: isMove ? `Moved "${card.title}" to "${targetColumn!.title}"` : `Edited card "${card.title}"`,
    })

    if (wasReassigned && updates.assigneeId && updates.assigneeId !== me.id) {
        const columnTitle = targetColumn?.title ?? (await Db.boardColumns.findOne({ _id: card.columnId }))?.title ?? ''
        const actionUrl = `/dashboard/${card.department}?tab=0`
        createNotification({
            userId: updates.assigneeId,
            type: 'board_card_assigned',
            title: 'Board card assigned to you',
            body: `${performedByName} assigned you "${card.title}"`,
            actionUrl,
            relatedId: id,
        })
        sendBoardCardAssignedDM(updates.assigneeId, card.title, columnTitle, actionUrl)
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/board/cards/[id] ───────────────────────────────────────

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const card = await Db.boardCards.findOne({ _id: objectId })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    const me = await authMember(card.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.boardCards.deleteOne({ _id: objectId })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'board.card.delete',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: card.department,
        entityType: 'card',
        entityId: id,
        target: `Deleted card "${card.title}"`,
    })

    return NextResponse.json({ success: true })
}
