import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const proposals = await Db.changeProposals
        .find({ courseInstanceId: id })
        .sort({ proposedAt: -1 })
        .toArray()

    return NextResponse.json({ proposals })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!instance.isLocked) return NextResponse.json({ error: 'Course is not locked' }, { status: 409 })

    const body = await req.json()
    const { entityType, entityId, fieldPath, previousValue, proposedValue } = body

    if (!entityType || !entityId || !fieldPath || proposedValue === undefined) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validEntityTypes: ChangeProposalEntityType[] = [
        'course_candidate', 'candidate_feedback', 'candidate_attendance',
        'training_record', 'course_session', 'course_instance',
    ]
    if (!validEntityTypes.includes(entityType)) {
        return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    const proposal: ChangeProposal = {
        entityType,
        entityId: entityId.toString(),
        courseInstanceId: id,
        fieldPath: fieldPath.toString().trim(),
        previousValue: (previousValue ?? '').toString(),
        proposedValue: proposedValue.toString().trim(),
        proposedBy: me.id,
        proposedByName: displayName,
        proposedAt: now,
        status: 'pending',
        isDirectCorrection: false,
    }

    const result = await Db.changeProposals.insertOne(proposal)

    // Notify J3 leads
    await createNotificationForRole('J3 - Department Leader', {
        type: 'task_assigned',
        title: `Change Proposal — ${instance.instanceRef}`,
        body: `${displayName} proposed an edit to ${fieldPath} on ${instance.instanceRef}. Review pending.`,
        actionUrl: `/dashboard/unit/training-hub/course/${id}?view=proposals`,
        relatedId: result.insertedId.toString(),
    }).catch(() => {})

    return NextResponse.json({ proposal: { ...proposal, _id: result.insertedId } }, { status: 201 })
}
