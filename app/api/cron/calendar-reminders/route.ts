import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { sendCalendarReminderDM, sendMeetingDM } from '@/lib/discord/bot'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'

/**
 * GET /api/cron/calendar-reminders?secret=...
 *
 * Handles all time-based notifications in one pass:
 *   1. Calendar event reminders (existing)
 *   2. Meeting notification queue (meeting_started, meeting_reminder,
 *      meeting_task_chaseup, meeting_attendance_overdue)
 *
 * Call this on a schedule (e.g. every 5 minutes via an external cron service).
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const base = process.env.NEXT_PUBLIC_BASEURL ?? ''

    // ── 1. Calendar reminders ─────────────────────────────────────────────────
    const dueCalendar = await Db.calendarReminders.find({
        fireAt: { $lte: now },
        firedAt: { $exists: false },
    }).toArray()

    await Promise.all(dueCalendar.map(async reminder => {
        const label = reminder.minutesBefore === 0
            ? 'is starting now'
            : reminder.minutesBefore < 60
                ? `is in ${reminder.minutesBefore} minute${reminder.minutesBefore === 1 ? '' : 's'}`
                : reminder.minutesBefore === 60
                    ? 'is in 1 hour'
                    : reminder.minutesBefore < 1440
                        ? `is in ${reminder.minutesBefore / 60} hours`
                        : 'is tomorrow'

        await Promise.all([
            createNotification({
                userId: reminder.userId,
                type: 'calendar_reminder',
                title: 'Event Reminder',
                body: `${reminder.eventTitle} ${label}.`,
                actionUrl: '/dashboard/unit/calendar',
                relatedId: reminder.eventId,
            }),
            sendCalendarReminderDM(reminder.userId, reminder.eventTitle, label, '/dashboard/unit/calendar')
                .catch(err => console.error('[cron] calendar DM failed:', err)),
        ])

        await Db.calendarReminders.updateOne(
            { _id: reminder._id as ObjectId },
            { $set: { firedAt: now } }
        )
    }))

    // ── 2. Meeting notification queue ─────────────────────────────────────────
    const dueMeeting = await Db.meetingNotifQueue.find({
        fireAt: { $lte: now },
        firedAt: { $exists: false },
    }).toArray()

    await Promise.all(dueMeeting.map(async item => {
        // Resolve recipient Discord user IDs
        let recipientIds: string[] = []

        if (item.recipientUserId) {
            recipientIds = [item.recipientUserId]
        } else if (item.recipientRole) {
            const roleUsers = await Db.users
                .find(
                    { 'guild.roles': item.recipientRole, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
                    { projection: { id: 1 } }
                )
                .toArray()
            recipientIds = roleUsers.map((u: { id: string }) => u.id)
        }

        if (recipientIds.length === 0) {
            await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
            return
        }

        // For attendance overdue: skip if all attendees are already confirmed
        if (item.type === 'meeting_attendance_overdue') {
            const mtg = await Db.meetings.findOne({ _id: new ObjectId(item.meetingId) }, { projection: { attendees: 1 } })
            const unconfirmed = (mtg?.attendees ?? []).filter((a: MeetingAttendee) =>
                ['pending', 'attending', 'not_attending'].includes(a.status)
            )
            if (unconfirmed.length === 0) {
                await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
                return
            }
        }

        // Build per-recipient notification body (personalise reminders by RSVP status)
        const mtgCache: Record<string, { attendees: MeetingAttendee[]; date: Date; title: string } | null> = {}
        async function getMtg() {
            if (!(item.meetingId in mtgCache)) {
                mtgCache[item.meetingId] = item.type === 'meeting_reminder'
                    ? await Db.meetings.findOne({ _id: new ObjectId(item.meetingId) }, { projection: { attendees: 1, date: 1, title: 1 } }) as { attendees: MeetingAttendee[]; date: Date; title: string } | null
                    : null
            }
            return mtgCache[item.meetingId]
        }

        await Promise.all(
            recipientIds.map(async userId => {
                // LOA members skip meeting_reminder and meeting_started
                if (item.type === 'meeting_reminder' || item.type === 'meeting_started') {
                    const mtg = await getMtg()
                    const attendee = (mtg?.attendees ?? []).find((a: MeetingAttendee) => a.userId === userId)
                    if (attendee?.status === 'loa') return
                }

                // Personalise reminder body by attendance status
                let body = item.notifyBody
                if (item.type === 'meeting_reminder') {
                    const mtg = await getMtg()
                    const attendee = (mtg?.attendees ?? []).find((a: MeetingAttendee) => a.userId === userId)
                    const dateLabel = mtg?.date ? new Date(mtg.date).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' }) : ''
                    if (attendee?.status === 'attending' || attendee?.status === 'confirmed_attended') {
                        body = `Reminder: "${mtg?.title}" is scheduled for ${dateLabel}. You are marked as attending.`
                    } else if (attendee?.status === 'not_attending' || attendee?.status === 'confirmed_absent') {
                        body = `Reminder: "${mtg?.title}" is on ${dateLabel}. You were marked as not attending — has your availability changed?`
                    }
                }

                await Promise.all([
                    createNotification({
                        userId,
                        type: item.type,
                        title: item.notifyTitle,
                        body,
                        actionUrl: item.actionUrl,
                        relatedId: item.meetingId,
                    }),
                    sendMeetingDM(userId, item.notifyTitle, body, item.actionUrl)
                        .catch(err => console.error(`[cron] meeting DM failed for ${userId}:`, err)),
                ])
            })
        )

        await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
    }))

    return NextResponse.json({
        calendarFired: dueCalendar.length,
        meetingFired: dueMeeting.length,
    })
}
