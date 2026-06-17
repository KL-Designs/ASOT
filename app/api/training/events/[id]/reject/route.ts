import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { sendTrainingRejectedDM } from '@/lib/discord/bot'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'pending') return NextResponse.json({ error: 'Event is not pending' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const reason = body.reason?.trim() || undefined

    await Db.trainingEvents.updateOne(
        { _id: new ObjectId(id) },
        { $set: { approvalStatus: 'rejected', rejectionReason: reason, updatedAt: new Date() } }
    )

    await Promise.all([
        createNotification({
            userId: event.trainerId,
            type: 'training_event_rejected',
            title: 'Training Session Rejected',
            body: reason ? `Your session "${event.title}" was rejected: ${reason}` : `Your session "${event.title}" was not approved.`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: id,
        }),
        sendTrainingRejectedDM(event.trainerId, event.title, reason, '/dashboard/unit/training-docs')
            .catch(err => console.error('[training/reject] DM failed:', err)),
    ])

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
