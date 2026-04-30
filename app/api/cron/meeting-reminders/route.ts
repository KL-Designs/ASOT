import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'

// GET /api/cron/meeting-reminders
// Called by a scheduled cron job (e.g. Vercel Cron, external scheduler).
// Performs two sweeps:
//  1. Meeting reminder — fires notifyRoles/notifyUserIds again at reminderDate
//  2. Attendance confirmation reminder — fires 24h after completion if attendance not finalised
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
    // Verify caller has the cron secret (set CRON_SECRET env var)
    if (CRON_SECRET) {
        const auth = request.headers.get('authorization')
        if (auth !== `Bearer ${CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    const now = new Date()
    let meetingReminders = 0
    let attendanceReminders = 0

    // ── 1. Meeting reminder notifications ────────────────────────────────────
    const meetingsNeedingReminder = await Db.meetings
        .find({
            reminderDate: { $lte: now },
            reminderSent: { $ne: true },
        })
        .toArray()

    for (const meeting of meetingsNeedingReminder) {
        const meetingId = meeting._id!.toString()
        const actionUrl = `/admin/${meeting.department}`
        const dateLabel = new Date(meeting.date).toLocaleDateString('en-AU', { dateStyle: 'medium' })

        const notifyRoles: string[] = meeting.notifyRoles ?? []
        const notifyUserIds: string[] = meeting.notifyUserIds ?? []

        // Skip LOA attendees when building per-user reminders
        const loaIds = new Set(
            (meeting.attendees ?? [])
                .filter((a: MeetingAttendee) => a.status === 'loa')
                .map((a: MeetingAttendee) => a.userId)
        )

        await Promise.all([
            ...notifyRoles.map((role: string) =>
                createNotificationForRole(role, {
                    type: 'meeting_reminder',
                    title: 'Meeting reminder',
                    body: `Reminder: "${meeting.title}" is scheduled for ${dateLabel}`,
                    actionUrl,
                    relatedId: meetingId,
                })
            ),
            ...notifyUserIds
                .filter((uid: string) => !loaIds.has(uid))
                .map((userId: string) =>
                    import('@/lib/notifications').then(({ createNotification }) =>
                        createNotification({
                            userId,
                            type: 'meeting_reminder',
                            title: 'Meeting reminder',
                            body: `Reminder: "${meeting.title}" is scheduled for ${dateLabel}`,
                            actionUrl,
                            relatedId: meetingId,
                        })
                    )
                ),
        ])

        await Db.meetings.updateOne(
            { _id: meeting._id },
            { $set: { reminderSent: true, updatedAt: now } }
        )
        meetingReminders++
    }

    // ── 2. Attendance confirmation reminders ─────────────────────────────────
    // Find completed meetings where:
    //  - attendanceConfirmationDeadline has passed
    //  - attendanceReminderSent is not true
    //  - there are still unconfirmed attendees (pending/attending/not_attending)
    const unfinishedAttendance = await Db.meetings
        .find({
            completed: true,
            attendanceConfirmationDeadline: { $lte: now },
            attendanceReminderSent: { $ne: true },
        })
        .toArray()

    for (const meeting of unfinishedAttendance) {
        const unconfirmed = (meeting.attendees ?? []).filter((a: MeetingAttendee) =>
            ['pending', 'attending', 'not_attending'].includes(a.status)
        )
        if (unconfirmed.length === 0) {
            // All confirmed — just mark reminder as sent (no need to fire)
            await Db.meetings.updateOne(
                { _id: meeting._id },
                { $set: { attendanceReminderSent: true, updatedAt: now } }
            )
            continue
        }

        // Notify the department lead role
        const dept = meeting.department as keyof typeof PERMISSIONS.departmentLeads
        const leadRoles = PERMISSIONS.departmentLeads[dept] ?? []
        const meetingId = meeting._id!.toString()
        const actionUrl = `/admin/${meeting.department}`

        await Promise.all(
            leadRoles.map((role: string) =>
                createNotificationForRole(role, {
                    type: 'meeting_attendance_overdue',
                    title: 'Meeting attendance not confirmed',
                    body: `Meeting attendance has not been confirmed. Please review and finalise attendance for "${meeting.title}". ${unconfirmed.length} attendee${unconfirmed.length !== 1 ? 's' : ''} still unconfirmed.`,
                    actionUrl,
                    relatedId: meetingId,
                })
            )
        )

        await Db.meetings.updateOne(
            { _id: meeting._id },
            { $set: { attendanceReminderSent: true, updatedAt: now } }
        )
        attendanceReminders++
    }

    return NextResponse.json({
        ok: true,
        meetingReminders,
        attendanceReminders,
        checkedAt: now.toISOString(),
    })
}
