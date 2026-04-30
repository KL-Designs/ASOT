import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'

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

    let body: {
        department: MeetingDepartment
        title: string
        date: string
        carryoverFromId?: string
        notifyRoles?: string[]
        notifyUserIds?: string[]
        reminderDate?: string
    }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { department, title, date, carryoverFromId, notifyRoles, notifyUserIds, reminderDate } = body
    if (!department || !title?.trim() || !date) return NextResponse.json({ error: 'department, title and date are required' }, { status: 400 })

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey]) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()

    // Carry over incomplete tasks from previous meeting if requested
    let carriedTasks: MeetingTask[] = []
    if (carryoverFromId) {
        const { ObjectId } = await import('mongodb')
        if (ObjectId.isValid(carryoverFromId)) {
            const prev = await Db.meetings.findOne({ _id: new ObjectId(carryoverFromId) })
            if (prev) {
                const { randomUUID } = await import('crypto')
                carriedTasks = prev.tasks
                    .filter((t: MeetingTask) => t.status !== 'completed')
                    .map((t: MeetingTask) => ({
                        ...t,
                        id: randomUUID(),
                        status: 'pending' as const,
                        carriedOverFrom: carryoverFromId,
                        completedAt: undefined,
                        completedByName: undefined,
                        createdAt: now,
                    }))
            }
        }
    }

    const result = await Db.meetings.insertOne({
        department,
        title: title.trim(),
        date: new Date(date),
        tasks: carriedTasks,
        attachments: [],
        attendees: [],
        locked: false,
        notifyRoles: notifyRoles ?? [],
        notifyUserIds: notifyUserIds ?? [],
        reminderDate: reminderDate ? new Date(reminderDate) : undefined,
        reminderSent: false,
        createdBy: me.id,
        createdByName: displayName,
        createdAt: now,
        updatedAt: now,
    })

    const meetingId = result.insertedId.toString()
    const actionUrl = `/admin/${department}`
    const meetingTitle = title.trim()

    // Notify roles immediately on creation
    if (notifyRoles && notifyRoles.length > 0) {
        await Promise.all(notifyRoles.map(role =>
            createNotificationForRole(role, {
                type: 'meeting_created',
                title: 'New meeting scheduled',
                body: `${displayName} created a meeting: "${meetingTitle}" on ${new Date(date).toLocaleDateString('en-AU', { dateStyle: 'medium' })}`,
                actionUrl,
                relatedId: meetingId,
            })
        ))
    }

    // Notify specific members immediately on creation
    if (notifyUserIds && notifyUserIds.length > 0) {
        await Promise.all(notifyUserIds.map(userId =>
            createNotification({
                userId,
                type: 'meeting_created',
                title: 'New meeting scheduled',
                body: `${displayName} created a meeting: "${meetingTitle}" on ${new Date(date).toLocaleDateString('en-AU', { dateStyle: 'medium' })}`,
                actionUrl,
                relatedId: meetingId,
            })
        ))
    }

    return NextResponse.json({ ok: true, id: meetingId })
}
