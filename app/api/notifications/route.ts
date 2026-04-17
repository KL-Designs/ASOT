import { ObjectId } from 'mongodb'
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { sendCalendarReminderDM } from '@/lib/discord/bot'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'

// GET /api/notifications — fetch the current user's notifications (newest first, max 50)
// Also fires any calendar reminders that are due for this user (avoids needing an external cron).
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fire any due calendar reminders for this user
    const now = new Date()
    const dueReminders = await Db.calendarReminders.find({
        userId: me.id,
        fireAt: { $lte: now },
        firedAt: { $exists: false },
    }).toArray()

    if (dueReminders.length > 0) {
        await Promise.all(dueReminders.map(async reminder => {
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
                    actionUrl: '/admin/unit/calendar',
                    relatedId: reminder.eventId,
                }),
                sendCalendarReminderDM(reminder.userId, reminder.eventTitle, label, '/admin/unit/calendar')
                    .catch(err => console.error('[reminder] Discord DM failed:', err)),
            ])

            await Db.calendarReminders.updateOne(
                { _id: reminder._id as ObjectId },
                { $set: { firedAt: now } }
            )
        }))
    }

    const docs = await Db.notifications
        .find({ userId: me.id, dismissedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

    const notifications = docs.map(n => ({
        ...n,
        _id: n._id!.toString(),
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ notifications })
}

// DELETE /api/notifications — dismiss all notifications
export async function DELETE() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await Db.notifications.updateMany(
        { userId: me.id, dismissedAt: { $exists: false } },
        { $set: { dismissedAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await Db.notifications.updateMany(
        { userId: me.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
