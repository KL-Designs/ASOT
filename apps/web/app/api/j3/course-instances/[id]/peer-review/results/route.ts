import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { calcBordaResults } from '@/lib/training/borda'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id }, { sort: { createdAt: -1 } })
    if (!round) return NextResponse.json({ error: 'No round found' }, { status: 404 })

    const submissions = await Db.peerReviewSubmissions
        .find({ roundId: round._id!.toString() })
        .toArray()

    const results = calcBordaResults(submissions, round.selectedCandidateIds)

    // Enrich with candidate display names
    const candidateMap: Record<string, { displayName: string; candidateNumber: number }> = {}
    for (const sub of submissions) {
        candidateMap[sub.reviewerCandidateId] = {
            displayName: sub.reviewerDisplayName,
            candidateNumber: sub.reviewerCandidateNumber,
        }
    }

    const enriched = results.map(r => ({
        ...r,
        displayName: candidateMap[r.candidateId]?.displayName ?? '—',
        candidateNumber: candidateMap[r.candidateId]?.candidateNumber ?? 0,
    }))

    const submittedCount = submissions.filter(s => s.status === 'submitted').length

    return NextResponse.json({ results: enriched, submittedCount, totalCount: submissions.length })
}
