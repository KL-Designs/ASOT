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
    if (ticket.status !== 'pending') return NextResponse.json({ error: 'Only pending tickets can request amendments' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const amendmentNotes = body.amendmentNotes?.trim()
    if (!amendmentNotes) return NextResponse.json({ error: 'Amendment notes are required' }, { status: 400 })

    const now = new Date()
    const reviewerName = me.guild?.displayName ?? me.username

    await Db.trainingTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                status: 'amendments_requested',
                amendmentNotes,
                reviewedById: me.id,
                reviewedByName: reviewerName,
                reviewedAt: now,
                updatedAt: now,
            },
        }
    )

    createNotification({
        userId: ticket.trainerId,
        type: 'training_ticket_amendments',
        title: 'Training Ticket — Amendments Required',
        body: `J3 has requested amendments to your training ticket for "${ticket.trainingTypeName}": ${amendmentNotes}`,
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: id,
    }).catch(console.error)

    logAction({
        action: 'training.ticket.amend',
        category: 'training',
        performedBy: me.id,
        performedByName: reviewerName,
        department: 'j3',
        entityType: 'training_ticket',
        entityId: id,
        actionUrl: '/dashboard/j3',
        target: ticket.trainingTypeName,
        details: { amendmentNotes },
    }).catch(console.error)

    const updated = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
