import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roundId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let oid: ObjectId
    try { oid = new ObjectId(roundId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const round = await Db.peerReviewRounds.findOne({ _id: oid })
    if (!round || round.status !== 'unlocked') {
        return NextResponse.json({ error: 'Round not unlocked' }, { status: 400 })
    }

    const submission = await Db.peerReviewSubmissions.findOne({ roundId, reviewerUserId: me.id })
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    // Already started — return existing expiry
    if (submission.rankingStartedAt) {
        const rankingExtMs = submission.extensions
            .filter(e => e.status === 'approved' && e.currentStage === 'ranking')
            .reduce((sum, e) => sum + (e.additionalMs ?? 0), 0)
        const rankingExpiryAt = submission.rankingStartedAt.getTime() + round.rankingDurationMs + rankingExtMs
        return NextResponse.json({ rankingExpiryAt })
    }

    const now = new Date()
    await Db.peerReviewSubmissions.updateOne(
        { _id: submission._id },
        { $set: { rankingStartedAt: now, status: 'started', updatedAt: now } }
    )

    const rankingExpiryAt = now.getTime() + round.rankingDurationMs
    return NextResponse.json({ rankingExpiryAt })
}
