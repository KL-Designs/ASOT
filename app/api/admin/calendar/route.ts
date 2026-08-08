import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { createNotification } from '@/lib/notifications'
import { ObjectId } from 'mongodb'

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
    // Private events only visible to their creator
    const filter: Record<string, unknown> = {
        $or: [
            { isPrivate: { $ne: true } },
            { createdById: me.id },
        ],
    }
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
            const start = new Date(op.date)
            const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)
            opEvents.push({
                _id: `op-${op._id.toString()}`,
                title: op.title,
                start: start.toISOString(),
                end: end.toISOString(),
                department: 'j2',
                createdById: '',
                createdByName: '',
                createdAt: start.toISOString(),
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
    const {
        title, description, start, end, allDay, department,
        isBCTAvailability, isQuizAvailability, applicantId, applicantName,
        timePeriod, isPrivate, templateTrainingTypeId,
        isJ2Unavailability, isMissionCheckRequest, relatedOperationId, relatedOperationTitle,
    } = body

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

    // J2-specific permission gates
    if (isJ2Unavailability && !client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Forbidden — J2 Lead role required' }, { status: 403 })
    }
    if (isMissionCheckRequest && !client.hasRoles(me, PERMISSIONS.departments.j2)) {
        return NextResponse.json({ error: 'Forbidden — J2 membership required' }, { status: 403 })
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
        ...(isBCTAvailability ? { isBCTAvailability: true } : {}),
        ...(isQuizAvailability ? { isQuizAvailability: true } : {}),
        ...(applicantId ? { applicantId } : {}),
        ...(applicantName ? { applicantName } : {}),
        ...(timePeriod ? { timePeriod } : {}),
        ...(isPrivate ? { isPrivate: true } : {}),
        ...(templateTrainingTypeId ? { templateTrainingTypeId } : {}),
        ...(isJ2Unavailability ? { isJ2Unavailability: true } : {}),
        ...(isMissionCheckRequest ? { isMissionCheckRequest: true } : {}),
        ...(relatedOperationId ? { relatedOperationId } : {}),
        ...(relatedOperationTitle ? { relatedOperationTitle } : {}),
    }

    const result = await Db.calendarEvents.insertOne(event as CalendarEvent)
    const eventId = result.insertedId.toString()

    // Mission check request: create task + notify J2 leads + confirm to mission maker
    if (isMissionCheckRequest && relatedOperationId && relatedOperationTitle) {
        const task: Omit<Task, '_id'> = {
            title: `Mission Check: ${relatedOperationTitle}`,
            description: `**${displayName}** has requested a mission check for **${relatedOperationTitle}**.\n\nScheduled for: ${startDate.toLocaleString('en-AU', { timeZone: 'UTC' })} UTC`,
            assignedRole: PERMISSIONS.departmentLeads.j2[0],
            assignedBy: me.id,
            assignedByName: displayName,
            dueDate: startDate,
            department: 'j2',
            type: 'mission_check',
            relatedId: relatedOperationId,
            actionUrl: `/operations/${relatedOperationId}`,
            createdAt: new Date(),
            status: 'pending',
        }
        const taskResult = await Db.tasks.insertOne(task as Task)
        const taskId = taskResult.insertedId.toString()

        // Stamp the task ID back onto the calendar event
        await Db.calendarEvents.updateOne(
            { _id: new ObjectId(eventId) },
            { $set: { relatedTaskId: taskId } }
        )

        // Notify all J2 leads
        const J2_LEAD_ROLES = PERMISSIONS.departmentLeads.j2
        const leads = await Db.users
            .find({ 'guild.roles': { $in: J2_LEAD_ROLES }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
            .project<{ id: string }>({ id: 1 })
            .toArray()

        const notifiedIds = new Set<string>()
        for (const lead of leads) {
            if (!lead.id || notifiedIds.has(lead.id)) continue
            notifiedIds.add(lead.id)
            createNotification({
                userId: lead.id,
                type: 'mission_check_requested',
                title: `Mission Check Requested: ${relatedOperationTitle}`,
                body: `**${displayName}** has requested a mission check for **${relatedOperationTitle}** scheduled for ${startDate.toLocaleDateString('en-AU')}.`,
                actionUrl: '/dashboard/j2',
                relatedId: eventId,
            })
        }

        // Confirm back to the mission maker
        createNotification({
            userId: me.id,
            type: 'mission_check_confirmed',
            title: 'Mission Check Requested',
            body: `Your mission check request for **${relatedOperationTitle}** has been submitted. J2 leads have been notified and a task has been created for assignment.`,
            actionUrl: '/dashboard/j2',
            relatedId: eventId,
        })
    }

    logAction({
        action: 'calendar.create',
        category: 'calendar',
        performedBy: me.id,
        performedByName: displayName,
        target: `Created event "${title.trim()}" in ${department.toUpperCase()}`,
        details: { eventId, department, start, end },
    })

    return NextResponse.json({ ok: true, id: eventId })
}
