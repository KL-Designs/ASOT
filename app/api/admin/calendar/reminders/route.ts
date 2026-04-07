import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

/** GET /api/admin/calendar/reminders?eventId=... — fetch current user's reminders for an event */
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const eventId = request.nextUrl.searchParams.get('eventId')
    if (!eventId) return NextResponse.json({ reminders: [] })

    const reminders = await Db.calendarReminders.find({ userId: me.id, eventId }).toArray()

    return NextResponse.json({
        reminders: reminders.map(r => ({
            ...r,
            _id: r._id!.toString(),
            eventStart: r.eventStart.toISOString(),
            fireAt: r.fireAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
        })),
    })
}

/** POST /api/admin/calendar/reminders — set or update a specific reminder (keyed by eventId + minutesBefore) */
export async function POST(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { eventId, minutesBefore } = await request.json()
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

    const mins = Number(minutesBefore)
    if (!Number.isFinite(mins) || mins < 0) return NextResponse.json({ error: 'Invalid minutesBefore' }, { status: 400 })

    let eventObjId: ObjectId
    try { eventObjId = new ObjectId(eventId) } catch {
        return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 })
    }

    const event = await Db.calendarEvents.findOne({ _id: eventObjId })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const eventStart = new Date(event.start)
    const fireAt = new Date(eventStart.getTime() - mins * 60_000)

    await Db.calendarReminders.updateOne(
        { userId: me.id, eventId, minutesBefore: mins },
        {
            $set: {
                userId: me.id,
                eventId,
                eventTitle: event.title,
                eventStart,
                minutesBefore: mins,
                fireAt,
                createdAt: new Date(),
            },
            $unset: { firedAt: '' },
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/admin/calendar/reminders?eventId=...
 * Optional: &minutesBefore=60 to remove a specific one.
 * Without minutesBefore: removes ALL reminders for the event.
 */
export async function DELETE(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const eventId = request.nextUrl.searchParams.get('eventId')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

    const mbParam = request.nextUrl.searchParams.get('minutesBefore')
    if (mbParam !== null) {
        const mins = Number(mbParam)
        await Db.calendarReminders.deleteOne({ userId: me.id, eventId, minutesBefore: mins })
    } else {
        await Db.calendarReminders.deleteMany({ userId: me.id, eventId })
    }

    return NextResponse.json({ ok: true })
}
