import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'crypto'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roundId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let oid: ObjectId
    try { oid = new ObjectId(roundId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const body = await req.json().catch(() => ({}))
    const { reason } = body as { reason?: string }

    const submission = await Db.peerReviewSubmissions.findOne({
        roundId,
        reviewerUserId: me.id,
        status: { $in: ['started', 'feedback_active', 'time_expired'] },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found or not eligible' }, { status: 404 })

    const round = await Db.peerReviewRounds.findOne({ _id: oid })
    if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

    const now = new Date()
    const stage: 'ranking' | 'feedback' =
        submission.status === 'started' ? 'ranking' : 'feedback'

    const extension: PeerReviewExtension = {
        id: randomUUID(),
        requestedAt: now,
        reason,
        status: 'pending',
        currentStage: stage,
    }

    await Db.peerReviewSubmissions.updateOne(
        { _id: submission._id },
        { $push: { extensions: extension as never }, $set: { updatedAt: now } }
    )

    // Notify J3 leads of the time request
    createNotificationForRole('J3 - Department Leader', {
        type: 'peer_review_extension_requested',
        title: 'Peer Review — Time Extension Requested',
        body: `Candidate #${submission.reviewerCandidateNumber} (${submission.reviewerDisplayName}) is requesting additional time during the ${stage} stage.`,
        actionUrl: `/dashboard/unit/training-hub/course/${round.courseInstanceId}`,
        relatedId: submission._id!.toString(),
    }).catch(() => {})

    return NextResponse.json({ ok: true, extensionId: extension.id })
}
