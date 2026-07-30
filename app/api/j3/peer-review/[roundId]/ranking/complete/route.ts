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

    const round = await Db.peerReviewRounds.findOne({ _id: oid })
    if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { ranking = [], timedOut = false } = body as { ranking?: string[]; timedOut?: boolean }

    const submission = await Db.peerReviewSubmissions.findOne({
        roundId,
        reviewerUserId: me.id,
        status: { $in: ['started', 'ranking_complete'] },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const now = new Date()
    const rankingExtMs = submission.extensions
        .filter(e => e.status === 'approved' && e.currentStage === 'ranking')
        .reduce((sum, e) => sum + (e.additionalMs ?? 0), 0)
    const rankingExpiryAt = submission.rankingStartedAt!.getTime() + round.rankingDurationMs + rankingExtMs
    const rankingUsedMs = Math.min(now.getTime() - submission.rankingStartedAt!.getTime(), round.rankingDurationMs + rankingExtMs)

    // Unused ranking time → bonus for feedback (capped at 0)
    const unusedMs = Math.max(0, rankingExpiryAt - now.getTime())
    const rankingBonusMs = timedOut ? 0 : unusedMs

    // Auto-place any unranked candidates at bottom
    let finalRanking = ranking
    const allIds = round.selectedCandidateIds
    const missingIds = allIds.filter(id => !finalRanking.includes(id))
    let isIncomplete = false
    const flags: string[] = []

    if (missingIds.length > 0) {
        finalRanking = [...finalRanking, ...missingIds]
        isIncomplete = true
        flags.push(`auto_placed_${missingIds.length}_candidates`)
    }

    await Db.peerReviewSubmissions.updateOne(
        { _id: submission._id },
        {
            $set: {
                ranking: finalRanking,
                status: 'feedback_active',
                rankingCompletedAt: now,
                feedbackStartedAt: now,
                rankingBonusMs,
                rankingUsedMs,
                isIncomplete,
                validationFlags: flags,
                updatedAt: now,
            },
        }
    )

    const feedbackExtMs = 0 // no extensions yet at start of feedback
    const feedbackExpiryAt = now.getTime() + round.feedbackDurationMs + rankingBonusMs + feedbackExtMs

    return NextResponse.json({ feedbackExpiryAt, rankingBonusMs, isIncomplete })
}
