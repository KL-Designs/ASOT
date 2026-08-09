import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendPeerReviewExtensionResultDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; subId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, subId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(subId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const body = await req.json()
    const { action, extensionId, additionalMs } = body as { action: 'approve' | 'reject'; extensionId: string; additionalMs?: number }
    if (!action || !extensionId) return NextResponse.json({ error: 'action and extensionId required' }, { status: 400 })
    if (action === 'approve' && (!additionalMs || additionalMs <= 0)) {
        return NextResponse.json({ error: 'additionalMs required for approve' }, { status: 400 })
    }

    const submission = await Db.peerReviewSubmissions.findOne({ _id: oid, courseInstanceId: id })
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ext = submission.extensions.find(e => e.id === extensionId)
    if (!ext) return NextResponse.json({ error: 'Extension request not found' }, { status: 404 })
    if (ext.status !== 'pending') return NextResponse.json({ error: 'Extension already decided' }, { status: 409 })

    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    await Db.peerReviewSubmissions.updateOne(
        { _id: oid, 'extensions.id': extensionId },
        {
            $set: {
                'extensions.$.status': action === 'approve' ? 'approved' : 'rejected',
                'extensions.$.decidedAt': now,
                'extensions.$.decidedById': me.id,
                'extensions.$.decidedByName': name,
                ...(action === 'approve' ? { 'extensions.$.additionalMs': additionalMs } : {}),
                updatedAt: now,
            },
        }
    )

    const actionLabel = action === 'approve' ? 'peer_review.extension_approved' : 'peer_review.extension_rejected'
    await Db.courseActivityLogs.insertOne({
        courseInstanceId: id,
        courseCandidateId: submission.reviewerCandidateId,
        candidateNumber: submission.reviewerCandidateNumber,
        action: actionLabel,
        performedById: me.id,
        performedByName: name,
        createdAt: now,
    } as CourseActivityLog)

    await logAction({
        action: action === 'approve' ? 'peer_review.extension_approved' : 'peer_review.extension_rejected',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'peer_review_submission',
        entityId: subId,
        after: {
            courseInstanceId: id,
            ...(action === 'approve' ? { additionalMs } : {}),
        },
    })

    // Notify candidate
    if (submission.reviewerUserId) {
        const actionUrl = `/peer-review/${submission.roundId}`
        const notifType = action === 'approve' ? 'peer_review_extension_approved' : 'peer_review_extension_rejected'
        createNotification({
            userId: submission.reviewerUserId,
            type: notifType,
            title: action === 'approve' ? 'Time Extension Approved' : 'Time Extension Denied',
            body: action === 'approve'
                ? `You have been granted ${Math.round((additionalMs ?? 0) / 60000)} additional minute(s).`
                : 'Your request for additional time was denied.',
            actionUrl,
            relatedId: submission.roundId,
        }).catch(() => {})
        sendPeerReviewExtensionResultDM(
            submission.reviewerUserId,
            action === 'approve',
            additionalMs ? Math.round(additionalMs / 60000) : undefined,
            actionUrl,
        ).catch(() => {})
    }

    return NextResponse.json({ ok: true })
}
