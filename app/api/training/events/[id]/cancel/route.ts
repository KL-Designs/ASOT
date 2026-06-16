import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isOwner = event.trainerId === me.id

    if (!isJ3Lead && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (event.status === 'Completed') return NextResponse.json({ error: 'Cannot cancel a completed event' }, { status: 400 })
    if (event.status === 'Cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })

    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'Cancelled', updatedAt: new Date() } }
    )

    if (event.calendarEventId && ObjectId.isValid(event.calendarEventId)) {
        await Db.calendarEvents.deleteOne({ _id: new ObjectId(event.calendarEventId) })
        await Db.trainingEvents.updateOne({ _id: new ObjectId(id) }, { $unset: { calendarEventId: '' } })
    }

    const attendees = await Db.trainingAttendance.find({
        eventId: id,
        rsvpStatus: 'attending',
    }).toArray()

    await Promise.all(attendees.map(a =>
        createNotification({
            userId: a.memberId,
            type: 'training_event_cancelled',
            title: 'Training Session Cancelled',
            body: `${event.title} has been cancelled.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: id,
        }).catch(console.error)
    ))

    // Also remove their reminders
    if (attendees.length > 0) {
        await Db.calendarReminders.deleteMany({ relatedId: id } as unknown as CalendarReminder)
    }

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
