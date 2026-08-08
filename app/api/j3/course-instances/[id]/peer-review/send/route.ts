import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendPeerReviewInviteDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id, status: 'draft' })
    if (!round) return NextResponse.json({ error: 'No draft round found' }, { status: 404 })

    const roundId = round._id!.toString()
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    // Fetch all selected candidates
    const candidateOids = round.selectedCandidateIds.map(cid => {
        try { return new ObjectId(cid) } catch { return null }
    }).filter(Boolean) as ObjectId[]

    const candidates = await Db.courseCandidates.find({ _id: { $in: candidateOids } }).toArray()

    // Create one submission per candidate
    const submissions: Omit<PeerReviewSubmission, '_id'>[] = candidates.map(c => ({
        roundId,
        courseInstanceId: id,
        reviewerCandidateId: c._id!.toString(),
        reviewerCandidateNumber: c.candidateNumber,
        reviewerUserId: c.userId ?? '',
        reviewerDisplayName: c.displayName,
        status: 'waiting' as const,
        hasOpenedWaitingRoom: false,
        isReady: false,
        ranking: [],
        feedback: {},
        rankingBonusMs: 0,
        isIncomplete: false,
        validationFlags: [],
        extensions: [],
        createdAt: now,
        updatedAt: now,
    }))

    if (submissions.length > 0) {
        await Db.peerReviewSubmissions.insertMany(submissions as PeerReviewSubmission[])
    }

    await Db.peerReviewRounds.updateOne(
        { _id: round._id },
        { $set: { status: 'sent', sentAt: now, sentById: me.id, sentByName: name } }
    )

    // Get course instance for ref
    const instance = await Db.courseInstances.findOne({ courseInstanceId: id } as Record<string, unknown>)

    // Notify each candidate (fire and forget)
    for (const c of candidates) {
        if (!c.userId) continue
        const actionUrl = `/peer-review/${roundId}`
        createNotification({
            userId: c.userId,
            type: 'peer_review_assigned',
            title: 'Peer Review — Action Required',
            body: `Your peer review forms are ready. Complete them before the deadline.`,
            actionUrl,
            relatedId: roundId,
        }).catch(() => {})
        sendPeerReviewInviteDM(c.userId, instance?.instanceRef ?? id, actionUrl).catch(() => {})
    }

    await Db.courseActivityLogs.insertOne({
        courseInstanceId: id,
        action: 'peer_review.sent',
        performedById: me.id,
        performedByName: name,
        createdAt: now,
    } as CourseActivityLog)

    await logAction({
        action: 'peer_review.send',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'peer_review_round',
        entityId: roundId,
        after: { courseInstanceId: id, sentAt: now },
    })

    return NextResponse.json({ ok: true })
}
