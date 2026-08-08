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

    const request = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Request is not pending' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const reason = body.reason?.trim() || undefined

    await Db.trainingRequests.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected', rejectedReason: reason, updatedAt: new Date() } }
    )

    createNotification({
        userId: request.requestedById,
        type: 'training_request_rejected',
        title: 'Training Request Rejected',
        body: `Your training request for ${request.trainingTypeName} was not approved${reason ? `: ${reason}` : '.'}`,
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: id,
    }).catch(console.error)

    const rejectorName = me.guild?.displayName ?? me.username
    logAction({
        action: 'training.request.reject',
        category: 'training',
        performedBy: me.id,
        performedByName: rejectorName,
        department: 'j3',
        entityType: 'training_request',
        entityId: id,
        actionUrl: '/dashboard/unit/training-docs',
        target: request.trainingTypeName,
        details: reason ? { reason } : undefined,
    }).catch(console.error)

    const updated = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
