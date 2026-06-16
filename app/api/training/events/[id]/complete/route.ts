import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'

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

    // Count members marked as attended
    const attendeeCount = await Db.trainingAttendance.countDocuments({ eventId: id, attended: true })

    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'Completed', completionNotes, attendeeCount, updatedAt: now } }
    )

    // Increment trainer's billet count
    const billetPath = `milpac.billetCounts.${event.billetField}`
    await Db.users.updateOne(
        { id: event.trainerId },
        { $inc: { [billetPath]: event.billetPointsAwarded } }
    )

    // Notify trainer if someone else marked it complete
    if (event.trainerId !== me.id) {
        await createNotification({
            userId: event.trainerId,
            type: 'training_event_completed',
            title: 'Training Session Completed',
            body: `Your session "${event.title}" has been marked complete. ${event.billetPointsAwarded} billet point${event.billetPointsAwarded !== 1 ? 's' : ''} have been awarded.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: id,
        }).catch(console.error)
    }

    // Create J4 admin task to confirm billet award in the Master Sheet
    const billetLabel = event.billetField === 'j3Bct12' ? 'J3 BCT 1/2' : 'J3 Other Trainings'
    const completedByName = me.guild?.displayName ?? me.username
    await Db.tasks.insertOne({
        title: `Training Completion — ${event.title}`,
        description: `${event.trainerName} ran "${event.title}" on ${event.scheduledAt.toLocaleDateString('en-GB')}. ${event.billetPointsAwarded} pt(s) auto-awarded to ${billetLabel} billet count. ${attendeeCount} member${attendeeCount !== 1 ? 's' : ''} attended. Please verify the billet count is accurate in the Master Sheet.`,
        assignedRole: 'J4 - Administration',
        assignedBy: me.id,
        assignedByName: completedByName,
        department: 'j3',
        status: 'pending',
        type: 'manual',
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: id,
        createdAt: now,
    })

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
