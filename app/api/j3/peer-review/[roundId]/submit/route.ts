import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roundId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let oid: ObjectId
    try { oid = new ObjectId(roundId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const submission = await Db.peerReviewSubmissions.findOne({
        roundId,
        reviewerUserId: me.id,
        status: { $in: ['feedback_active', 'time_expired'] },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found or already submitted' }, { status: 404 })

    const round = await Db.peerReviewRounds.findOne({ _id: oid })
    if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

    // Validate: all peers ranked (ranking must be full length)
    if (submission.ranking.length < round.candidateCount) {
        return NextResponse.json({ error: 'Ranking incomplete' }, { status: 400 })
    }

    // Validate: all peers have feedback or noFeedback
    const missingFeedback = round.selectedCandidateIds.filter(cid => {
        const fb = submission.feedback[cid]
        return !fb || (!fb.noFeedback && !fb.text?.trim())
    })
    if (missingFeedback.length > 0) {
        return NextResponse.json({ error: `Feedback missing for ${missingFeedback.length} candidate(s)` }, { status: 400 })
    }

    const now = new Date()
    const feedbackUsedMs = submission.feedbackStartedAt
        ? now.getTime() - submission.feedbackStartedAt.getTime()
        : 0

    await Db.peerReviewSubmissions.updateOne(
        { _id: submission._id },
        { $set: { status: 'submitted', submittedAt: now, feedbackUsedMs, updatedAt: now } }
    )

    await Db.courseActivityLogs.insertOne({
        courseInstanceId: round.courseInstanceId,
        courseCandidateId: submission.reviewerCandidateId,
        candidateNumber: submission.reviewerCandidateNumber,
        action: 'peer_review.submitted',
        performedById: me.id,
        performedByName: submission.reviewerDisplayName,
        createdAt: now,
    } as CourseActivityLog)

    // Auto-complete round if everyone has submitted
    const totalSubs = await Db.peerReviewSubmissions.countDocuments({ roundId })
    const submittedCount = await Db.peerReviewSubmissions.countDocuments({ roundId, status: 'submitted' })
    if (submittedCount >= totalSubs && totalSubs > 0) {
        await Db.peerReviewRounds.updateOne({ _id: oid }, { $set: { status: 'completed', completedAt: now } })
    }

    return NextResponse.json({ ok: true })
}
