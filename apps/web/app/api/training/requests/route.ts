import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)

    const query = isJ3Lead
        ? {}
        : { status: { $in: ['pending', 'approved'] as TrainingRequest['status'][] } }

    const requests = await Db.trainingRequests.find(query).sort({ createdAt: -1 }).toArray()

    return NextResponse.json({ requests, myId: me.id, isJ3Lead })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { trainingTypeId, preferredAt, description } = body

    if (!trainingTypeId || !ObjectId.isValid(trainingTypeId)) return NextResponse.json({ error: 'Invalid training type' }, { status: 400 })

    const trainingType = await Db.trainingTypes.findOne({ _id: new ObjectId(trainingTypeId) })
    if (!trainingType) return NextResponse.json({ error: 'Training type not found' }, { status: 404 })

    const preferredDate = preferredAt ? new Date(preferredAt) : undefined
    const requestedByName = me.guild?.displayName ?? me.username
    const now = new Date()

    const result = await Db.trainingRequests.insertOne({
        trainingTypeId: trainingTypeId.toString(),
        trainingTypeName: trainingType.name,
        requestedById: me.id,
        requestedByName,
        preferredAt: preferredDate && !isNaN(preferredDate.getTime()) ? preferredDate : undefined,
        description: description?.trim() || undefined,
        status: 'pending',
        interestedCount: 0,
        interestedUserIds: [],
        createdAt: now,
        updatedAt: now,
    })

    const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']
    await Promise.all(J3_LEAD_ROLES.map(role =>
        createNotificationForRole(role, {
            type: 'training_request_submitted',
            title: 'Training Request Submitted',
            body: `${requestedByName} requested a training session: ${trainingType.name}`,
            actionUrl: '/dashboard/unit/training-docs',
            relatedId: result.insertedId.toString(),
        })
    ))

    logAction({
        action: 'training.request.submit',
        category: 'training',
        performedBy: me.id,
        performedByName: requestedByName,
        department: 'j3',
        entityType: 'training_request',
        entityId: result.insertedId.toString(),
        actionUrl: '/dashboard/unit/training-docs',
        target: trainingType.name,
    }).catch(console.error)

    const created = await Db.trainingRequests.findOne({ _id: result.insertedId })
    return NextResponse.json(created, { status: 201 })
}
