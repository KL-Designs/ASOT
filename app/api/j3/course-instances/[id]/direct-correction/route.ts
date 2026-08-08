import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only J3 leads and J4 can directly correct a locked course
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!instance.isLocked) return NextResponse.json({ error: 'Course is not locked' }, { status: 409 })

    const body = await req.json()
    const { entityType, entityId, fieldPath, previousValue, newValue, reason } = body

    if (!entityType || !entityId || !fieldPath || newValue === undefined || !reason?.toString().trim()) {
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

    // Record as an approved direct correction (no pending stage)
    const correction: ChangeProposal = {
        entityType,
        entityId: entityId.toString(),
        courseInstanceId: id,
        fieldPath: fieldPath.toString().trim(),
        previousValue: (previousValue ?? '').toString(),
        proposedValue: newValue.toString().trim(),
        proposedBy: me.id,
        proposedByName: displayName,
        proposedAt: now,
        status: 'approved',
        reviewedBy: me.id,
        reviewedByName: displayName,
        reviewedAt: now,
        reviewComment: reason.toString().trim(),
        approvedValue: newValue.toString().trim(),
        isDirectCorrection: true,
    }

    const result = await Db.changeProposals.insertOne(correction)

    await logAction({
        action: 'training_record.direct_correction',
        category: 'J3',
        performedBy: me.id,
        performedByName: displayName,
        department: 'J3',
        entityType: 'course_instance',
        entityId: id,
        after: {
            instanceRef: instance.instanceRef,
            fieldPath,
            previousValue,
            newValue,
            reason: reason.toString().trim(),
        },
    })

    return NextResponse.json({ correction: { ...correction, _id: result.insertedId } }, { status: 201 })
}
