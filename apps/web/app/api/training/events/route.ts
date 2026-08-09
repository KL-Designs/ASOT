import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)
    const isJ3Trainer = client.hasRoles(me, PERMISSIONS.training.trainer)

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

    const scheduledIds = events
        .filter(e => e.approvalStatus === 'approved' && e.status === 'Scheduled')
        .map(e => e._id!.toString())

    const [slotDocs, ownDocs] = scheduledIds.length > 0
        ? await Promise.all([
            Db.trainingAttendance.aggregate([
                { $match: { eventId: { $in: scheduledIds }, rsvpStatus: { $in: ['attending', 'waitlist'] } } },
                { $group: { _id: { eventId: '$eventId', slotType: '$slotType', rsvpStatus: '$rsvpStatus' }, count: { $sum: 1 } } },
            ]).toArray(),
            Db.trainingAttendance.find({ eventId: { $in: scheduledIds }, memberId: me.id }).toArray(),
        ])
        : [[], []]

    // Build per-event slot counts
    const slotCounts: Record<string, { trainer: number; trainee: number; sitIn: number; traineeWaitlist: number; sitInWaitlist: number }> = {}
    for (const doc of slotDocs as Array<{ _id: { eventId: string; slotType: string; rsvpStatus: string }; count: number }>) {
        const { eventId, slotType, rsvpStatus } = doc._id
        if (!slotCounts[eventId]) slotCounts[eventId] = { trainer: 0, trainee: 0, sitIn: 0, traineeWaitlist: 0, sitInWaitlist: 0 }
        if (slotType === 'trainer' && rsvpStatus === 'attending') slotCounts[eventId].trainer = doc.count
        if (slotType === 'trainee' && rsvpStatus === 'attending') slotCounts[eventId].trainee = doc.count
        if (slotType === 'sit-in' && rsvpStatus === 'attending') slotCounts[eventId].sitIn = doc.count
        if (slotType === 'trainee' && rsvpStatus === 'waitlist') slotCounts[eventId].traineeWaitlist = doc.count
        if (slotType === 'sit-in' && rsvpStatus === 'waitlist') slotCounts[eventId].sitInWaitlist = doc.count
        // Backward compat: old records without slotType counted as trainee attending
        if (!slotType && rsvpStatus === 'attending') slotCounts[eventId].trainee += doc.count
        if (!slotType && rsvpStatus === 'waitlist') slotCounts[eventId].traineeWaitlist += doc.count
    }

    // Keep legacy rsvpCounts shape for components not yet updated
    const rsvpCounts: Record<string, { attending: number; waitlist: number }> = {}
    for (const [eid, sc] of Object.entries(slotCounts)) {
        rsvpCounts[eid] = { attending: sc.trainer + sc.trainee + sc.sitIn, waitlist: sc.traineeWaitlist + sc.sitInWaitlist }
    }

    const myRsvps: Record<string, { slotType: string; rsvpStatus: string }> = {}
    for (const doc of ownDocs) {
        myRsvps[doc.eventId] = { slotType: doc.slotType ?? 'trainee', rsvpStatus: doc.rsvpStatus }
    }

    return NextResponse.json({ events, isJ3Lead, isTrainer, isJ3Trainer, myId: me.id, rsvpCounts, slotCounts, myRsvps })
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
    if (!trainingType) return NextResponse.json({ error: 'Training type not found' }, { status: 404 })

    const isJ3Trainer = client.hasRoles(me, PERMISSIONS.training.trainer)
    const trainerName = me.guild?.displayName ?? me.username
    const now = new Date()

    const trainerSlotsVal = Math.max(1, Math.floor(Number(body.trainerSlots)) || 1)

    const result = await Db.trainingEvents.insertOne({
        trainingTypeId: trainingTypeId.toString(),
        trainingTypeName: trainingType.name,
        title: title.trim(),
        description: description?.trim() || undefined,
        scheduledAt: scheduledDate,
        durationMinutes: Math.max(15, Math.floor(Number(durationMinutes)) || 60),
        server: body.server?.trim() || trainingType.server || undefined,
        requiredMods: Array.isArray(body.requiredMods) ? body.requiredMods.filter(Boolean) : trainingType.requiredMods,
        location: location?.trim() || undefined,
        trainerSlots: trainerSlotsVal,
        maxTraineeSlots: body.maxTraineeSlots ? Math.max(1, Math.floor(Number(body.maxTraineeSlots)) || 1) : undefined,
        maxSitInSlots: body.maxSitInSlots ? Math.max(1, Math.floor(Number(body.maxSitInSlots)) || 1) : undefined,
        trainerId: me.id,
        trainerName,
        isJ3Training: isJ3Trainer ? (body.isJ3Training !== false) : false,
        status: 'Scheduled',
        approvalStatus: 'pending',
        billetField: trainingType.billetField,
        billetPointsAwarded: trainingType.billetPoints,
        attendeeCount: 0,
        createdAt: now,
        updatedAt: now,
    })

    // Auto-RSVP primary trainer into a trainer slot
    await Db.trainingAttendance.insertOne({
        eventId: result.insertedId.toString(),
        memberId: me.id,
        memberName: trainerName,
        slotType: 'trainer',
        rsvpStatus: 'attending',
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

    logAction({
        action: 'training.event.create',
        category: 'training',
        performedBy: me.id,
        performedByName: trainerName,
        department: 'j3',
        entityType: 'training_event',
        entityId: result.insertedId.toString(),
        actionUrl: '/dashboard/unit/training-docs',
        target: title.trim(),
    }).catch(console.error)

    const created = await Db.trainingEvents.findOne({ _id: result.insertedId })
    return NextResponse.json(created, { status: 201 })
}
