import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const ticket = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.status !== 'pending' && ticket.status !== 'amendments_requested') {
        return NextResponse.json({ error: 'Only pending or amendments_requested tickets can be approved' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const j3Notes = body.j3Notes?.trim() || undefined

    // Apply per-attendee pass decisions from body if provided
    let attendees = ticket.attendees
    if (Array.isArray(body.attendees)) {
        const patchMap = new Map<string, { passed?: boolean }>(
            body.attendees.map((a: { memberId: string; passed?: boolean }) => [a.memberId, a])
        )
        attendees = ticket.attendees.map(a => {
            const patch = patchMap.get(a.memberId)
            return patch ? { ...a, ...(patch.passed !== undefined && { passed: patch.passed }) } : a
        })
    }

    const now = new Date()
    const reviewerName = me.guild?.displayName ?? me.username

    // Award trainer billet points
    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(ticket.eventId) })
    if (event) {
        const billetPath = `milpac.billetCounts.${event.billetField}`
        await Db.users.updateOne(
            { id: ticket.trainerId },
            { $inc: { [billetPath]: event.billetPointsAwarded } }
        )
    }

    // Mark qualifications awarded on passed trainees
    const finalAttendees = attendees.map(a => ({
        ...a,
        billetPointsAwarded: a.slotType === 'trainer',
        qualificationAwarded: a.slotType === 'trainee' && a.passed === true,
    }))

    await Db.trainingTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                status: 'approved',
                attendees: finalAttendees,
                j3Notes,
                reviewedById: me.id,
                reviewedByName: reviewerName,
                reviewedAt: now,
                billetPointsAwarded: true,
                qualificationsAwarded: true,
                updatedAt: now,
            },
        }
    )

    // Notify trainer
    createNotification({
        userId: ticket.trainerId,
        type: 'training_ticket_approved',
        title: 'Training Ticket Approved',
        body: `Your training ticket for "${ticket.trainingTypeName}" has been approved by J3. Billet points have been awarded.`,
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: id,
    }).catch(console.error)

    logAction({
        action: 'training.ticket.approve',
        category: 'training',
        performedBy: me.id,
        performedByName: reviewerName,
        department: 'j3',
        entityType: 'training_ticket',
        entityId: id,
        actionUrl: '/dashboard/j3',
        target: ticket.trainingTypeName,
        details: { trainerId: ticket.trainerId, trainerName: ticket.trainerName },
    }).catch(console.error)

    const updated = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
