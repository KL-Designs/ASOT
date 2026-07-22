import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { createNotification } from '@/lib/notifications'
import { sendBoardCardAssignedDM } from '@/lib/discord/bot'


function authMember(department: string, me: User) {
    const deptKey = department as keyof typeof PERMISSIONS.departments
    return !!PERMISSIONS.departments[deptKey] && client.hasRoles(me, PERMISSIONS.departments[deptKey])
}


// ── GET /api/admin/board/cards?department=j7 ────────────────────────────────

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department) return NextResponse.json({ error: 'department is required' }, { status: 400 })
    if (!authMember(department, me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const cards = await Db.boardCards.find({ department }).sort({ order: 1 }).toArray()
    return NextResponse.json({ cards: JSON.parse(JSON.stringify(cards)) })
}


// ── POST /api/admin/board/cards ──────────────────────────────────────────────
// Body: { department, columnId, title, description?, assigneeId?, assigneeName?, linkedTaskId? }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { department, columnId, title } = body
    if (!department || !columnId || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'department, columnId, and title are required' }, { status: 400 })
    }
    if (!authMember(department, me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let columnObjectId: ObjectId
    try { columnObjectId = new ObjectId(columnId) } catch { return NextResponse.json({ error: 'Invalid columnId' }, { status: 400 }) }

    const column = await Db.boardColumns.findOne({ _id: columnObjectId, department })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    let linkedTaskObjectId: ObjectId | undefined
    if (typeof body.linkedTaskId === 'string' && body.linkedTaskId) {
        try { linkedTaskObjectId = new ObjectId(body.linkedTaskId) } catch { return NextResponse.json({ error: 'Invalid linkedTaskId' }, { status: 400 }) }
    }

    const last = await Db.boardCards.find({ columnId: columnObjectId }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newCard: BoardCard = {
        _id: new ObjectId(),
        department,
        columnId: columnObjectId,
        title: title.trim(),
        description: typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
        assigneeId: typeof body.assigneeId === 'string' ? body.assigneeId : undefined,
        assigneeName: typeof body.assigneeName === 'string' ? body.assigneeName : undefined,
        linkedTaskId: linkedTaskObjectId,
        order,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.boardCards.insertOne(newCard)

    logAction({
        action: 'board.card.create',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'card',
        entityId: String(newCard._id),
        target: `Created card "${newCard.title}" in "${column.title}"`,
    })

    if (newCard.assigneeId && newCard.assigneeId !== me.id) {
        const actionUrl = `/dashboard/${department}?tab=0`
        createNotification({
            userId: newCard.assigneeId,
            type: 'board_card_assigned',
            title: 'Board card assigned to you',
            body: `${performedByName} assigned you "${newCard.title}"`,
            actionUrl,
            relatedId: String(newCard._id),
        })
        sendBoardCardAssignedDM(newCard.assigneeId, newCard.title, column.title, actionUrl)
    }

    return NextResponse.json({ card: JSON.parse(JSON.stringify(newCard)) })
}
