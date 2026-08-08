import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; candidateId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
    const { id, candidateId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id })
    if (!round) return NextResponse.json({ hasRound: false, reviews: [] })

    const submissions = await Db.peerReviewSubmissions.find({
        courseInstanceId: id,
        status: 'submitted',
        reviewerCandidateId: { $ne: candidateId },
    }).toArray()

    const reviews = submissions
        .map(sub => {
            const fb = sub.feedback?.[candidateId]
            if (!fb) return null
            const rankIdx = sub.ranking?.indexOf(candidateId) ?? -1
            return {
                reviewerCandidateNumber: sub.reviewerCandidateNumber,
                reviewerDisplayName: sub.reviewerDisplayName,
                rank: rankIdx >= 0 ? rankIdx + 1 : null,
                feedbackText: fb.text ?? '',
                noFeedback: fb.noFeedback ?? false,
            }
        })
        .filter(Boolean)
        .sort((a, b) => a!.reviewerCandidateNumber - b!.reviewerCandidateNumber)

    return NextResponse.json({
        hasRound: true,
        roundStatus: round.status,
        reviews,
    })
}
