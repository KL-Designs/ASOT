import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/meetings?department=j1
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const dept = request.nextUrl.searchParams.get('department') as MeetingDepartment | null
    if (!dept) return NextResponse.json({ error: 'department is required' }, { status: 400 })

    const deptKey = dept as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey]) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const meetings = await Db.meetings
        .find({ department: dept })
        .sort({ date: -1 })
        .toArray()

    return NextResponse.json({ meetings })
}

// POST /api/admin/meetings
export async function POST(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    let body: { department: MeetingDepartment; title: string; date: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { department, title, date } = body
    if (!department || !title?.trim() || !date) return NextResponse.json({ error: 'department, title and date are required' }, { status: 400 })

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey]) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()

    const result = await Db.meetings.insertOne({
        department,
        title: title.trim(),
        date: new Date(date),
        tasks: [],
        attachments: [],
        locked: false,
        createdBy: me.id,
        createdByName: displayName,
        createdAt: now,
        updatedAt: now,
    })

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
