import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const VALID_DEPARTMENTS = ['j1', 'j2', 'j3', 'j4', 'j6', 'j7', 'unit']

// GET /api/admin/calendar — list events, optionally filtered by department
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const department = req.nextUrl.searchParams.get('department')
    const filter: Record<string, unknown> = {}
    if (department) filter.department = department

    const raw = await Db.calendarEvents
        .find(filter)
        .sort({ start: 1 })
        .toArray()

    const calEvents = raw.map(e => ({
        ...e,
        _id: e._id!.toString(),
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        createdAt: e.createdAt.toISOString(),
    }))

    // Merge operations as virtual all-day events (only when not filtering by a non-j2 dept)
    const opEvents: typeof calEvents = []
    if (!department || department === 'j2') {
        const ops = await Db.operations
            .find({ deletedAt: { $exists: false }, date: { $exists: true } })
            .sort({ date: 1 })
            .toArray()

        for (const op of ops) {
            const d = new Date(op.date)
            const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999)
            opEvents.push({
                _id: `op-${op._id.toString()}`,
                title: op.title,
                start: dayStart.toISOString(),
                end: dayEnd.toISOString(),
                allDay: true,
                department: 'j2',
                createdById: '',
                createdByName: '',
                createdAt: dayStart.toISOString(),
                isOperation: true,
                operationId: op._id.toString(),
            } as any)
        }
    }

    const events = [...calEvents, ...opEvents]

    return NextResponse.json({ events })
}

// POST /api/admin/calendar — create a new event
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { title, description, start, end, allDay, department } = body

    if (!title?.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!start || !end) {
        return NextResponse.json({ error: 'Start and end times are required' }, { status: 400 })
    }
    if (!VALID_DEPARTMENTS.includes(department)) {
        return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }

    const startDate = new Date(start)
    const endDate = new Date(end)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (startDate >= endDate) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const event: Omit<CalendarEvent, '_id'> = {
        title: title.trim(),
        start: startDate,
        end: endDate,
        allDay: allDay ?? false,
        department,
        createdById: me.id,
        createdByName: displayName,
        createdAt: new Date(),
        ...(description?.trim() ? { description: description.trim() } : {}),
    }

    const result = await Db.calendarEvents.insertOne(event as CalendarEvent)
    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
