import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'


function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function authLead(department: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    const leadKey = department as keyof typeof PERMISSIONS.departmentLeads
    if (!PERMISSIONS.departmentLeads[leadKey] || !client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])) return null
    return me
}


// ── PATCH /api/admin/board/columns/[id] ─────────────────────────────────────
// Body: { title?, order? }

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const column = await Db.boardColumns.findOne({ _id: objectId })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    const me = await authLead(column.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Partial<BoardColumn> = {}
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
    if (typeof body.order === 'number') updates.order = body.order
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.boardColumns.updateOne({ _id: objectId }, { $set: updates })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: updates.title ? 'board.column.rename' : 'board.column.reorder',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: column.department,
        entityType: 'column',
        entityId: id,
        target: updates.title ? `Renamed column "${column.title}" → "${updates.title}"` : `Reordered column "${column.title}"`,
    })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/board/columns/[id] ────────────────────────────────────
// Cascades: deletes every card in the column too.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const column = await Db.boardColumns.findOne({ _id: objectId })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    const me = await authLead(column.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.boardCards.deleteMany({ columnId: objectId })
    await Db.boardColumns.deleteOne({ _id: objectId })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'board.column.delete',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: column.department,
        entityType: 'column',
        entityId: id,
        target: `Deleted column "${column.title}"`,
    })

    return NextResponse.json({ success: true })
}
