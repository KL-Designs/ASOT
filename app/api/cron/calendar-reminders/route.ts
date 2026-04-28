import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { sendCalendarReminderDM } from '@/lib/discord/bot'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'

/**
 * GET /api/cron/calendar-reminders?secret=...
 *
 * Finds all calendar reminders that are due (fireAt <= now, not yet fired)
 * and sends an in-app notification to each user.
 *
 * Call this on a schedule (e.g. every 5 minutes via an external cron service).
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    const due = await Db.calendarReminders.find({
        fireAt: { $lte: now },
        firedAt: { $exists: false },
    }).toArray()

    if (due.length === 0) return NextResponse.json({ fired: 0 })

    await Promise.all(due.map(async reminder => {
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
                .catch(err => console.error('[reminder] Discord DM failed:', err)),
        ])

        await Db.calendarReminders.updateOne(
            { _id: reminder._id as ObjectId },
            { $set: { firedAt: now } }
        )
    }))

    return NextResponse.json({ fired: due.length })
}
