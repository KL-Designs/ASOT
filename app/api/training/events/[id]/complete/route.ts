import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isOwner = event.trainerId === me.id
    if (!isJ3Lead && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (event.approvalStatus !== 'approved') return NextResponse.json({ error: 'Event must be approved before it can be completed' }, { status: 400 })
    if (event.status !== 'Scheduled') return NextResponse.json({ error: `Cannot complete a ${event.status} event` }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const completionNotes = body.completionNotes?.trim() || undefined
    const now = new Date()

    // Fetch all attendance records for this event
    const attendanceRecords = await Db.trainingAttendance.find({ eventId: id }).toArray()

    // Build ticket attendee list — include all who RSVPd attending (trainer + confirmed trainees)
    // passed is undefined until J3 reviews
    const ticketAttendees: TrainingTicketAttendee[] = attendanceRecords
        .filter(r => r.rsvpStatus === 'attending' || r.attended)
        .map(r => ({
            memberId: r.memberId,
            memberName: r.memberName,
            slotType: r.slotType,
            attended: r.attended ?? (r.rsvpStatus === 'attending'),
            passed: r.slotType === 'trainer' ? true : undefined,
            qualificationAwarded: false,
            billetPointsAwarded: false,
        }))

    const attendeeCount = ticketAttendees.filter(a => a.attended && a.slotType !== 'trainer').length

    // Mark event complete (no billet points yet — deferred to ticket approval)
    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'Completed', completionNotes, attendeeCount, updatedAt: now } }
    )

    // Create the Training Ticket (pending J3 review)
    const ticketResult = await Db.trainingTickets.insertOne({
        eventId: id,
        trainingTypeId: event.trainingTypeId,
        trainingTypeName: event.trainingTypeName,
        trainerId: event.trainerId,
        trainerName: event.trainerName,
        scheduledAt: event.scheduledAt,
        completedAt: now,
        status: 'pending',
        attendees: ticketAttendees,
        trainerNotes: completionNotes,
        isJ3Training: event.isJ3Training,
        billetPointsAwarded: false,
        qualificationsAwarded: false,
        createdAt: now,
        updatedAt: now,
    })

    const ticketId = ticketResult.insertedId.toString()

    // Link ticket back to the event
    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ticketId, updatedAt: now } }
    )

    // Notify J3 leads that a ticket needs review
    createNotificationForRole(PERMISSIONS.training.manage[0], {
        type: 'training_ticket_pending',
        title: 'Training Ticket Pending Review',
        body: `"${event.title}" by ${event.trainerName} has been completed and needs J3 review.`,
        actionUrl: '/dashboard/j3',
        relatedId: ticketId,
    }).catch(console.error)

    // Notify trainer that ticket was submitted (only if someone else completed it)
    if (event.trainerId !== me.id) {
        createNotification({
            userId: event.trainerId,
            type: 'training_ticket_pending',
            title: 'Training Ticket Submitted',
            body: `Your session "${event.title}" has been marked complete. A Training Ticket has been submitted for J3 review — billet points will be awarded after approval.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: ticketId,
        }).catch(console.error)
    }

    const completedByName = me.guild?.displayName ?? me.username
    logAction({
        action: 'training.event.complete',
        category: 'training',
        performedBy: me.id,
        performedByName: completedByName,
        department: 'j3',
        entityType: 'training_event',
        entityId: id,
        actionUrl: '/dashboard/unit/training-docs',
        target: event.title,
        details: { ticketId, attendeeCount },
    }).catch(console.error)

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    const ticket = await Db.trainingTickets.findOne({ _id: ticketResult.insertedId })
    return NextResponse.json({ event: updated, ticket })
}
