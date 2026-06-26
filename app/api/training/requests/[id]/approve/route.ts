import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { scheduleTrainingReminders } from '@/lib/training/scheduleReminders'

// J3 approves a training request — creates an approved event
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const request = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Request is not pending' }, { status: 400 })

    const trainingType = await Db.trainingTypes.findOne({ _id: new ObjectId(request.trainingTypeId) })
    if (!trainingType) return NextResponse.json({ error: 'Training type not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))

    // Determine trainer: allow override from body, fall back to requester
    const trainerId = body.trainerId?.trim() || request.requestedById
    const trainerName = body.trainerName?.trim() || request.requestedByName

    // Determine scheduled time: body override, then preferredAt, then 7 days from now
    let scheduledAt: Date
    if (body.scheduledAt) {
        const d = new Date(body.scheduledAt)
        scheduledAt = isNaN(d.getTime()) ? new Date(Date.now() + 7 * 24 * 60 * 60_000) : d
    } else if (request.preferredAt) {
        scheduledAt = new Date(request.preferredAt)
    } else {
        scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60_000)
    }

    const approvedByName = me.guild?.displayName ?? me.username
    const now = new Date()

    // Create the event (pre-approved)
    const eventResult = await Db.trainingEvents.insertOne({
        trainingTypeId: request.trainingTypeId,
        trainingTypeName: request.trainingTypeName,
        title: body.title?.trim() || `${request.trainingTypeName} — ${request.requestedByName}`,
        description: request.description,
        scheduledAt,
        durationMinutes: trainingType.durationMinutes ?? 60,
        server: trainingType.server,
        requiredMods: trainingType.requiredMods,
        trainerSlots: 1,
        trainerId,
        trainerName,
        isJ3Training: true,
        status: 'Scheduled',
        approvalStatus: 'approved',
        approvedById: me.id,
        approvedByName,
        approvedAt: now,
        billetField: trainingType.billetField,
        billetPointsAwarded: trainingType.billetPoints,
        attendeeCount: 0,
        createdAt: now,
        updatedAt: now,
    })

    const eventId = eventResult.insertedId.toString()

    // Auto-RSVP trainer
    await Db.trainingAttendance.insertOne({
        eventId,
        memberId: trainerId,
        memberName: trainerName,
        slotType: 'trainer',
        rsvpStatus: 'attending',
        createdAt: now,
        updatedAt: now,
    })

    // Update request status
    await Db.trainingRequests.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'approved', approvedEventId: eventId, updatedAt: now } }
    )

    // Schedule 60-min and 15-min reminders for the new event
    const newEventTitle = body.title?.trim() || `${request.trainingTypeName} — ${request.requestedByName}`
    scheduleTrainingReminders(eventId, newEventTitle, scheduledAt).catch(console.error)

    // Notify requester
    createNotification({
        userId: request.requestedById,
        type: 'training_request_approved',
        title: 'Training Request Approved',
        body: `Your training request for ${request.trainingTypeName} has been approved and scheduled.`,
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: eventId,
    }).catch(console.error)

    // Notify interested members
    for (const userId of request.interestedUserIds) {
        if (userId === request.requestedById) continue
        createNotification({
            userId,
            type: 'training_request_approved',
            title: 'Training Scheduled',
            body: `${request.trainingTypeName} you were interested in has been scheduled.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: eventId,
        }).catch(console.error)
    }

    logAction({
        action: 'training.request.approve',
        category: 'training',
        performedBy: me.id,
        performedByName: approvedByName,
        department: 'j3',
        entityType: 'training_request',
        entityId: id,
        actionUrl: '/dashboard/unit/training-docs',
        target: request.trainingTypeName,
        details: { eventId },
    }).catch(console.error)

    const updated = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    const event = await Db.trainingEvents.findOne({ _id: eventResult.insertedId })
    return NextResponse.json({ request: updated, event })
}
