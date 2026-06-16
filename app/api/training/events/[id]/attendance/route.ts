import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    if (!isJ3Lead && event.trainerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const records = await Db.trainingAttendance
        .find({ eventId: id })
        .sort({ rsvpStatus: 1, memberName: 1 })
        .toArray()

    return NextResponse.json({ records })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: eventId } = await params
    if (!ObjectId.isValid(eventId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(eventId), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'approved' || event.status !== 'Scheduled') {
        return NextResponse.json({ error: 'Event is not open for RSVP' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const status = body.status as string
    if (!['attending', 'not_attending'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const memberName = me.guild?.displayName ?? me.username
    const now = new Date()

    // Find existing record
    const existing = await Db.trainingAttendance.findOne({ eventId, memberId: me.id })

    if (status === 'not_attending') {
        const wasAttending = existing?.rsvpStatus === 'attending'

        await Db.trainingAttendance.updateOne(
            { eventId, memberId: me.id },
            { $set: { eventId, memberId: me.id, memberName, rsvpStatus: 'not_attending', updatedAt: now }, $setOnInsert: { createdAt: now } },
            { upsert: true }
        )

        // Auto-promote first waitlisted member
        if (wasAttending) {
            const first = await Db.trainingAttendance.findOne(
                { eventId, rsvpStatus: 'waitlist' },
                { sort: { createdAt: 1 } }
            )
            if (first) {
                await Db.trainingAttendance.updateOne(
                    { _id: first._id },
                    { $set: { rsvpStatus: 'attending', updatedAt: now } }
                )
                createNotification({
                    userId: first.memberId,
                    type: 'training_rsvp_promoted',
                    title: 'You\'re now attending!',
                    body: `A spot opened up in ${event.title} — you\'ve been moved from the waitlist to attending.`,
                    actionUrl: '/dashboard/unit/training-docs',
                    relatedId: eventId,
                }).catch(console.error)
            }
        }

        // Delete reminder
        await Db.calendarReminders.deleteOne({ userId: me.id, relatedId: eventId } as unknown as CalendarReminder)

    } else {
        // attending — check capacity
        const attendingCount = await Db.trainingAttendance.countDocuments({
            eventId,
            memberId: { $ne: me.id },
            rsvpStatus: 'attending',
        })

        const atCapacity = !!(event.maxAttendees && attendingCount >= event.maxAttendees)
        const actualStatus = atCapacity ? 'waitlist' : 'attending'

        await Db.trainingAttendance.updateOne(
            { eventId, memberId: me.id },
            { $set: { eventId, memberId: me.id, memberName, rsvpStatus: actualStatus, updatedAt: now }, $setOnInsert: { createdAt: now } },
            { upsert: true }
        )

        // Create 1h-before reminder only for confirmed attending
        if (actualStatus === 'attending') {
            const fireAt = new Date(event.scheduledAt.getTime() - 60 * 60_000)
            if (fireAt > now) {
                await Db.calendarReminders.updateOne(
                    { userId: me.id, relatedId: eventId } as unknown as CalendarReminder,
                    {
                        $set: {
                            userId: me.id,
                            eventId: event.calendarEventId ?? eventId,
                            eventTitle: event.title,
                            eventStart: event.scheduledAt,
                            minutesBefore: 60,
                            fireAt,
                            relatedId: eventId,
                            createdAt: now,
                        } as unknown as CalendarReminder,
                    },
                    { upsert: true }
                )
            }
        } else {
            // Waitlisted — remove any reminder
            await Db.calendarReminders.deleteOne({ userId: me.id, relatedId: eventId } as unknown as CalendarReminder)
        }
    }

    const record = await Db.trainingAttendance.findOne({ eventId, memberId: me.id })
    return NextResponse.json(record)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId } = await params
    if (!ObjectId.isValid(eventId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(eventId), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    if (!isJ3Lead && event.trainerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const updates = body.updates as Array<{ memberId: string; attended: boolean }> | undefined
    if (!Array.isArray(updates)) return NextResponse.json({ error: 'updates array required' }, { status: 400 })

    const now = new Date()
    await Promise.all(updates.map(u =>
        Db.trainingAttendance.updateOne(
            { eventId, memberId: u.memberId },
            { $set: { attended: u.attended, updatedAt: now } }
        )
    ))

    return NextResponse.json({ ok: true, updated: updates.length })
}
