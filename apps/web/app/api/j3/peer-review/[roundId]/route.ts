import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roundId: string }> }

function calcExpiryAt(sub: PeerReviewSubmission, round: PeerReviewRound): { rankingExpiryAt: number | null; feedbackExpiryAt: number | null } {
    let rankingExpiryAt: number | null = null
    let feedbackExpiryAt: number | null = null

    if (sub.rankingStartedAt) {
        const rankingExtMs = sub.extensions
            .filter(e => e.status === 'approved' && e.currentStage === 'ranking')
            .reduce((sum, e) => sum + (e.additionalMs ?? 0), 0)
        rankingExpiryAt = sub.rankingStartedAt.getTime() + round.rankingDurationMs + rankingExtMs
    }

    if (sub.feedbackStartedAt) {
        const feedbackExtMs = sub.extensions
            .filter(e => e.status === 'approved' && e.currentStage === 'feedback')
            .reduce((sum, e) => sum + (e.additionalMs ?? 0), 0)
        feedbackExpiryAt = sub.feedbackStartedAt.getTime() + round.feedbackDurationMs + sub.rankingBonusMs + feedbackExtMs
    }

    return { rankingExpiryAt, feedbackExpiryAt }
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let oid: ObjectId
    try { oid = new ObjectId(roundId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const round = await Db.peerReviewRounds.findOne({ _id: oid })
    if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const submission = await Db.peerReviewSubmissions.findOne({
        roundId,
        reviewerUserId: me.id,
    })
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Mark waiting room opened
    if (!submission.hasOpenedWaitingRoom) {
        await Db.peerReviewSubmissions.updateOne(
            { _id: submission._id },
            { $set: { hasOpenedWaitingRoom: true, updatedAt: new Date() } }
        )
        submission.hasOpenedWaitingRoom = true
    }

    const { rankingExpiryAt, feedbackExpiryAt } = calcExpiryAt(submission, round)

    // Get peer list (all selected candidates) — numbers and display names only (no feedback/ranking)
    const candidateIds = round.selectedCandidateIds
    const peers = await Db.peerReviewSubmissions
        .find({ roundId })
        .project<{ reviewerCandidateId: string; reviewerCandidateNumber: number; reviewerDisplayName: string }>({
            reviewerCandidateId: 1, reviewerCandidateNumber: 1, reviewerDisplayName: 1,
        })
        .toArray()

    // Return own submission (including ranking/feedback), round meta, peer list
    return NextResponse.json({
        round: {
            _id: round._id,
            status: round.status,
            candidateCount: round.candidateCount,
            rankingDurationMs: round.rankingDurationMs,
            feedbackDurationMs: round.feedbackDurationMs,
            unlockedAt: round.unlockedAt,
        },
        submission,
        rankingExpiryAt,
        feedbackExpiryAt,
        peers: peers.map(p => ({
            candidateId: p.reviewerCandidateId,
            candidateNumber: p.reviewerCandidateNumber,
            displayName: p.reviewerDisplayName,
        })),
    })
}
