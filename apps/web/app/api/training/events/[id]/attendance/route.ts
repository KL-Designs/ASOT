import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { hasPermission } from '@/lib/orbat/hasPermission'

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
        .sort({ slotType: 1, rsvpStatus: 1, memberName: 1 })
        .toArray()

    return NextResponse.json({ records })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: eventId } = await params
    if (!ObjectId.isValid(eventId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(eventId), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'approved' || event.status !== 'Scheduled') {
        return NextResponse.json({ error: 'Event is not open for RSVP' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const memberName = me.guild?.displayName ?? me.username
    const now = new Date()

    // Cancel RSVP
    if (body.cancel === true || body.status === 'not_attending') {
        const existing = await Db.trainingAttendance.findOne({ eventId, memberId: me.id })
        const wasAttendingTrainee = existing?.rsvpStatus === 'attending' && (existing?.slotType === 'trainee' || !existing?.slotType)

        await Db.trainingAttendance.updateOne(
            { eventId, memberId: me.id },
            { $set: { eventId, memberId: me.id, memberName, slotType: existing?.slotType ?? 'trainee', rsvpStatus: 'not_attending', updatedAt: now }, $setOnInsert: { createdAt: now } },
            { upsert: true }
        )

        // Auto-promote first waitlisted trainee when an attending trainee cancels
        if (wasAttendingTrainee) {
            const first = await Db.trainingAttendance.findOne(
                { eventId, slotType: { $in: ['trainee', null] as any }, rsvpStatus: 'waitlist' },
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

        await Db.calendarReminders.deleteOne({ userId: me.id, relatedId: eventId } as unknown as CalendarReminder)

        logAction({
            action: 'training.rsvp.cancel',
            category: 'training',
            performedBy: me.id,
            performedByName: memberName,
            department: 'j3',
            entityType: 'training_event',
            entityId: eventId,
            target: event.title,
        }).catch(console.error)

        const record = await Db.trainingAttendance.findOne({ eventId, memberId: me.id })
        return NextResponse.json(record)
    }

    // Slot-based RSVP
    const rawSlot = body.slotType ?? (body.status === 'attending' ? 'trainee' : null)
    if (!rawSlot || !['trainer', 'trainee', 'sit-in'].includes(rawSlot)) {
        return NextResponse.json({ error: 'Invalid slotType' }, { status: 400 })
    }
    const slotType = rawSlot as TrainingSlotType

    // Trainer slot requires J3 trainer permission
    if (slotType === 'trainer' && !client.hasRoles(me, PERMISSIONS.training.trainer)) {
        return NextResponse.json({ error: 'Only J3 trainers can fill trainer slots' }, { status: 403 })
    }

    // Check if user already has an RSVP on this event
    const existing = await Db.trainingAttendance.findOne({ eventId, memberId: me.id })
    if (existing && existing.rsvpStatus !== 'not_attending' && existing.slotType !== slotType) {
        // Switching slot type — cancel old slot first (auto-promote handled by cancelling the old one if needed)
        const wasAttendingTrainee = existing.rsvpStatus === 'attending' && (existing.slotType === 'trainee' || !existing.slotType)
        if (wasAttendingTrainee) {
            const first = await Db.trainingAttendance.findOne(
                { eventId, slotType: { $in: ['trainee', null] as any }, rsvpStatus: 'waitlist', memberId: { $ne: me.id } },
                { sort: { createdAt: 1 } }
            )
            if (first) {
                await Db.trainingAttendance.updateOne({ _id: first._id }, { $set: { rsvpStatus: 'attending', updatedAt: now } })
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
    }

    // Determine actual RSVP status based on capacity
    let actualStatus: 'attending' | 'waitlist' = 'attending'

    if (slotType === 'trainer') {
        const currentTrainers = await Db.trainingAttendance.countDocuments({
            eventId, slotType: 'trainer', rsvpStatus: 'attending', memberId: { $ne: me.id },
        })
        const trainerSlots = event.trainerSlots ?? 1
        if (currentTrainers >= trainerSlots) {
            return NextResponse.json({ error: 'Trainer slots are full' }, { status: 409 })
        }
    } else if (slotType === 'trainee') {
        const currentTrainees = await Db.trainingAttendance.countDocuments({
            eventId, slotType: { $in: ['trainee', null] as any }, rsvpStatus: 'attending', memberId: { $ne: me.id },
        })
        if (event.maxTraineeSlots && currentTrainees >= event.maxTraineeSlots) {
            actualStatus = 'waitlist'
        }
    } else if (slotType === 'sit-in') {
        const currentSitIns = await Db.trainingAttendance.countDocuments({
            eventId, slotType: 'sit-in', rsvpStatus: 'attending', memberId: { $ne: me.id },
        })
        if (event.maxSitInSlots && currentSitIns >= event.maxSitInSlots) {
            actualStatus = 'waitlist'
        }
    }

    await Db.trainingAttendance.updateOne(
        { eventId, memberId: me.id },
        {
            $set: { eventId, memberId: me.id, memberName, slotType, rsvpStatus: actualStatus, updatedAt: now },
            $setOnInsert: { createdAt: now },
        },
        { upsert: true }
    )

    // Reminder for confirmed trainee/sit-in attending
    if (actualStatus === 'attending' && slotType !== 'trainer') {
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
        await Db.calendarReminders.deleteOne({ userId: me.id, relatedId: eventId } as unknown as CalendarReminder)
    }

    logAction({
        action: actualStatus === 'waitlist' ? 'training.rsvp.waitlist' : 'training.rsvp.attend',
        category: 'training',
        performedBy: me.id,
        performedByName: memberName,
        department: 'j3',
        entityType: 'training_event',
        entityId: eventId,
        target: event.title,
        details: { slotType, rsvpStatus: actualStatus },
    }).catch(console.error)

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
