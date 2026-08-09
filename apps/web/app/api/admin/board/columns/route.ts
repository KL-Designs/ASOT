import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'


// ── GET /api/admin/board/columns?department=j7 ─────────────────────────────
// Any member of the department may view.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department) return NextResponse.json({ error: 'department is required' }, { status: 400 })

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const columns = await Db.boardColumns.find({ department }).sort({ order: 1 }).toArray()
    return NextResponse.json({ columns: JSON.parse(JSON.stringify(columns)) })
}


// ── POST /api/admin/board/columns ───────────────────────────────────────────
// Body: { department, title }. Dept-lead or J4 only.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { department, title } = await request.json()
    if (!department || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'department and title are required' }, { status: 400 })
    }

    const leadKey = department as keyof typeof PERMISSIONS.departmentLeads
    if (!PERMISSIONS.departmentLeads[leadKey] || !client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const last = await Db.boardColumns.find({ department }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newColumn: BoardColumn = {
        _id: new ObjectId(),
        department,
        title: title.trim(),
        order,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.boardColumns.insertOne(newColumn)

    logAction({
        action: 'board.column.create',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'column',
        entityId: String(newColumn._id),
        target: `Created column "${newColumn.title}"`,
    })

    return NextResponse.json({ column: JSON.parse(JSON.stringify(newColumn)) })
}
