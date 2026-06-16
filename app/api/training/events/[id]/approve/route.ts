import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { sendTrainingApprovedDM } from '@/lib/discord/bot'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'pending') return NextResponse.json({ error: 'Event is not pending' }, { status: 400 })

    const approverName = me.guild?.displayName ?? me.username
    const now = new Date()

    // Create calendar event
    const start = event.scheduledAt
    const end = new Date(start.getTime() + (event.durationMinutes ?? 60) * 60_000)

    const calResult = await Db.calendarEvents.insertOne({
        title: event.title,
        description: `${event.trainingTypeName} — Trainer: ${event.trainerName}${event.location ? ` — ${event.location}` : ''}`,
        start,
        end,
        allDay: false,
        department: 'j3',
        createdById: me.id,
        createdByName: approverName,
        createdAt: now,
    })

    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                approvalStatus: 'approved',
                approvedById: me.id,
                approvedByName: approverName,
                approvedAt: now,
                calendarEventId: calResult.insertedId.toString(),
                updatedAt: now,
            },
        }
    )

    const scheduledStr = event.scheduledAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    await Promise.all([
        createNotification({
            userId: event.trainerId,
            type: 'training_event_approved',
            title: 'Training Session Approved',
            body: `Your session "${event.title}" has been approved for ${scheduledStr}.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: id,
        }),
        sendTrainingApprovedDM(event.trainerId, event.title, scheduledStr, '/dashboard/unit/training-docs')
            .catch(err => console.error('[training/approve] DM failed:', err)),
    ])

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
