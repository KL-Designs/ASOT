import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)

    const base: Record<string, unknown> = { deletedAt: { $exists: false } }

    if (!isJ3Lead) {
        if (isTrainer) {
            base.$or = [{ approvalStatus: 'approved' }, { trainerId: me.id }]
        } else {
            base.approvalStatus = 'approved'
            base.status = { $in: ['Scheduled', 'Completed'] }
        }
    }

    const events = await Db.trainingEvents.find(base).sort({ scheduledAt: -1 }).toArray()

    // Fetch RSVP counts and user's own RSVPs for approved+Scheduled events
    const scheduledIds = events
        .filter(e => e.approvalStatus === 'approved' && e.status === 'Scheduled')
        .map(e => e._id!.toString())

    const [countDocs, ownDocs] = scheduledIds.length > 0
        ? await Promise.all([
            Db.trainingAttendance.aggregate([
                { $match: { eventId: { $in: scheduledIds }, rsvpStatus: { $in: ['attending', 'waitlist'] } } },
                { $group: { _id: { eventId: '$eventId', rsvpStatus: '$rsvpStatus' }, count: { $sum: 1 } } },
            ]).toArray(),
            Db.trainingAttendance.find({ eventId: { $in: scheduledIds }, memberId: me.id }).toArray(),
        ])
        : [[], []]

    const rsvpCounts: Record<string, { attending: number; waitlist: number }> = {}
    for (const doc of countDocs as Array<{ _id: { eventId: string; rsvpStatus: string }; count: number }>) {
        const { eventId, rsvpStatus } = doc._id
        if (!rsvpCounts[eventId]) rsvpCounts[eventId] = { attending: 0, waitlist: 0 }
        if (rsvpStatus === 'attending') rsvpCounts[eventId].attending = doc.count
        if (rsvpStatus === 'waitlist') rsvpCounts[eventId].waitlist = doc.count
    }

    const myRsvps: Record<string, string> = {}
    for (const doc of ownDocs) myRsvps[doc.eventId] = doc.rsvpStatus

    return NextResponse.json({ events, isJ3Lead, isTrainer, myId: me.id, rsvpCounts, myRsvps })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.create)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { trainingTypeId, title, description, scheduledAt, location, durationMinutes } = body

    if (!trainingTypeId || !ObjectId.isValid(trainingTypeId)) return NextResponse.json({ error: 'Invalid training type' }, { status: 400 })
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

    const trainingType = await Db.trainingTypes.findOne({ _id: new ObjectId(trainingTypeId) })
    if (!trainingType || !trainingType.isActive) return NextResponse.json({ error: 'Training type not found' }, { status: 404 })

    const trainerName = me.guild?.displayName ?? me.username
    const now = new Date()

    const result = await Db.trainingEvents.insertOne({
        trainingTypeId: trainingTypeId.toString(),
        trainingTypeName: trainingType.name,
        title: title.trim(),
        description: description?.trim() || undefined,
        scheduledAt: scheduledDate,
        durationMinutes: Math.max(15, Math.floor(Number(durationMinutes)) || 60),
        location: location?.trim() || undefined,
        trainerId: me.id,
        trainerName,
        status: 'Scheduled',
        approvalStatus: 'pending',
        billetField: trainingType.billetField,
        billetPointsAwarded: trainingType.billetPoints,
        createdAt: now,
        updatedAt: now,
    })

    const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']
    await Promise.all(J3_LEAD_ROLES.map(role =>
        createNotificationForRole(role, {
            type: 'training_event_submitted',
            title: 'Training Request Pending',
            body: `${trainerName} submitted a training request: ${title.trim()}`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: result.insertedId.toString(),
        })
    ))

    const created = await Db.trainingEvents.findOne({ _id: result.insertedId })
    return NextResponse.json(created, { status: 201 })
}
