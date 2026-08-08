import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
    const { id, pid } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only J3 leads and J4 can approve/reject
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId, poid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid course ID' }, { status: 400 }) }
    try { poid = new ObjectId(pid) } catch { return NextResponse.json({ error: 'Invalid proposal ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const proposal = await Db.changeProposals.findOne({ _id: poid, courseInstanceId: id })
    if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    if (proposal.status !== 'pending') return NextResponse.json({ error: 'Proposal already reviewed' }, { status: 409 })

    const body = await req.json()
    const { action, comment, approvedValue } = body

    if (action !== 'approve' && action !== 'reject') {
        return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    const finalValue = approvedValue !== undefined ? approvedValue.toString().trim() : proposal.proposedValue

    await Db.changeProposals.updateOne({ _id: poid }, {
        $set: {
            status: action === 'approve' ? 'approved' : 'rejected',
            reviewedBy: me.id,
            reviewedByName: displayName,
            reviewedAt: now,
            reviewComment: comment?.toString()?.trim() ?? undefined,
            approvedValue: action === 'approve' ? finalValue : undefined,
        },
    })

    await logAction({
        action: action === 'approve' ? 'course.change_approved' : 'course.change_rejected',
        category: 'J3',
        performedBy: me.id,
        performedByName: displayName,
        department: 'J3',
        entityType: 'course_instance',
        entityId: id,
        after: {
            instanceRef: instance.instanceRef,
            proposalId: pid,
            fieldPath: proposal.fieldPath,
            proposedBy: proposal.proposedByName,
            ...(action === 'approve' ? { approvedValue: finalValue } : { comment }),
        },
    })

    // Notify the submitter
    await createNotification({
        userId: proposal.proposedBy,
        type: action === 'approve' ? 'task_completed' : 'system',
        title: `Proposal ${action === 'approve' ? 'Approved' : 'Rejected'} — ${instance.instanceRef}`,
        body: action === 'approve'
            ? `Your proposed edit to "${proposal.fieldPath}" was approved by ${displayName}.`
            : `Your proposed edit to "${proposal.fieldPath}" was rejected by ${displayName}${comment ? `: ${comment}` : '.'}`,
        actionUrl: `/dashboard/unit/training-hub/course/${id}?view=proposals`,
        relatedId: pid,
    }).catch(() => {})

    const updated = await Db.changeProposals.findOne({ _id: poid })
    return NextResponse.json({ proposal: updated })
}
