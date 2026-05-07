import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { notifyMeetingUser, notifyMeetingRole } from '@/lib/notifications/meeting'
import { initMeetingAttendance } from '@/lib/attendance/meeting-init'
import { logAction } from '@/lib/logAction'

const DEPT_NAMES: Record<string, string> = {
    j1: 'J1 Recruitment', j2: 'J2 Mission Making', j3: 'J3 Training',
    j4: 'J4 Administration', j5: 'J5 Media', j6: 'J6 Game Masters',
    j7: 'J7 Community Development',
}

// GET /api/admin/meetings?department=j1
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const dept = request.nextUrl.searchParams.get('department') as MeetingDepartment | null
    if (!dept) return NextResponse.json({ error: 'department is required' }, { status: 400 })

    const deptKey = dept as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey]) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const meetings = await Db.meetings.find({ department: dept }).sort({ date: -1 }).toArray()
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
        invitedUserIds?: string[]
        reminderDate?: string
    }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { department, title, date, carryoverFromId, notifyRoles, notifyUserIds, invitedUserIds, reminderDate } = body
    if (!department || !title?.trim() || !date) return NextResponse.json({ error: 'department, title and date are required' }, { status: 400 })

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey]) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()

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
                        ...t, id: randomUUID(), status: 'pending' as const,
                        carriedOverFrom: carryoverFromId, completedAt: undefined,
                        completedByName: undefined, createdAt: now,
                    }))
            }
        }
    }

    const result = await Db.meetings.insertOne({
        department, title: title.trim(), date: new Date(date),
        tasks: carriedTasks, attachments: [], attendees: [],
        invitedUserIds: invitedUserIds ?? [], locked: false,
        notifyRoles: notifyRoles ?? [], notifyUserIds: notifyUserIds ?? [],
        reminderDate: reminderDate ? new Date(reminderDate) : undefined,
        reminderSent: false,
        createdBy: me.id, createdByName: displayName, createdAt: now, updatedAt: now,
    })

    const meetingId = result.insertedId.toString()
    const meetingTitle = title.trim()
    const deptName = DEPT_NAMES[department] ?? department.toUpperCase()
    const dateLabel = new Date(date).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })
    const actionUrl = `/dashboard/meeting/${meetingId}`

    const creationBody = `${displayName} scheduled a new meeting: "${meetingTitle}"\nDepartment: ${deptName} · ${dateLabel}\n\nPlease mark your expected attendance.`
    const notifOpts = { type: 'meeting_created' as const, title: `New meeting: ${meetingTitle}`, body: creationBody, actionUrl, meetingId }

    // Auto-initialise attendance list from dept members + J4 + invited members
    await initMeetingAttendance(meetingId, department, invitedUserIds ?? [])
        .catch(err => console.error('[meetings] attendance init failed:', err))

    // Log the creation
    await logAction({
        action: 'meeting.create',
        category: 'meeting',
        performedBy: me.id,
        performedByName: displayName,
        department,
        entityType: 'meeting',
        entityId: meetingId,
        actionUrl: `/dashboard/meeting/${meetingId}`,
        target: `"${meetingTitle}" (${deptName})`,
    })

    // Fire creation notifications immediately (website + Discord DM)
    const allUserIds = [...new Set([...(notifyUserIds ?? []), ...(invitedUserIds ?? [])])]
    await Promise.all([
        ...(notifyRoles ?? []).map(role => notifyMeetingRole(role, notifOpts)),
        ...allUserIds.map(uid => notifyMeetingUser(uid, notifOpts)),
    ])

    // Queue time-delayed notifications (reminder + meeting start) — handled by cron
    const timedQueue: Omit<MeetingNotifQueueRecord, '_id'>[] = []

    // Meeting start notification — fires at the meeting date/time
    const startTitle = `Meeting starting: ${meetingTitle}`
    const startBody  = `"${meetingTitle}" (${deptName}) is starting now.`
    for (const role of notifyRoles ?? []) {
        timedQueue.push({ meetingId, type: 'meeting_started', notifyTitle: startTitle, notifyBody: startBody, actionUrl, fireAt: new Date(date), recipientRole: role })
    }
    for (const uid of allUserIds) {
        timedQueue.push({ meetingId, type: 'meeting_started', notifyTitle: startTitle, notifyBody: startBody, actionUrl, fireAt: new Date(date), recipientUserId: uid })
    }

    // Reminder notification — fires at reminderDate
    if (reminderDate) {
        const reminderAt    = new Date(reminderDate)
        const reminderTitle = `Meeting reminder: ${meetingTitle}`
        const reminderBody  = `Reminder: "${meetingTitle}" (${deptName}) is scheduled for ${dateLabel}. Please confirm your attendance.`
        for (const role of notifyRoles ?? []) {
            timedQueue.push({ meetingId, type: 'meeting_reminder', notifyTitle: reminderTitle, notifyBody: reminderBody, actionUrl, fireAt: reminderAt, recipientRole: role })
        }
        for (const uid of allUserIds) {
            timedQueue.push({ meetingId, type: 'meeting_reminder', notifyTitle: reminderTitle, notifyBody: reminderBody, actionUrl, fireAt: reminderAt, recipientUserId: uid })
        }
    }

    if (timedQueue.length > 0) await Db.meetingNotifQueue.insertMany(timedQueue)

    return NextResponse.json({ ok: true, id: meetingId })
}
