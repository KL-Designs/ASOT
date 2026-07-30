import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { calcTimers } from '@/lib/training/peer-review-timers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id }, { sort: { createdAt: -1 } })
    if (!round) return NextResponse.json({ round: null, submissions: [] })

    const submissions = await Db.peerReviewSubmissions
        .find({ roundId: round._id!.toString() })
        .project<Pick<PeerReviewSubmission, '_id' | 'reviewerCandidateId' | 'reviewerCandidateNumber' | 'reviewerDisplayName' | 'status' | 'hasOpenedWaitingRoom' | 'isReady' | 'rankingStartedAt' | 'rankingCompletedAt' | 'feedbackStartedAt' | 'submittedAt' | 'isIncomplete' | 'extensions' | 'rankingUsedMs' | 'feedbackUsedMs'>>({
            _id: 1, reviewerCandidateId: 1, reviewerCandidateNumber: 1, reviewerDisplayName: 1,
            status: 1, hasOpenedWaitingRoom: 1, isReady: 1, rankingStartedAt: 1,
            rankingCompletedAt: 1, feedbackStartedAt: 1, submittedAt: 1, isIncomplete: 1,
            extensions: 1, rankingUsedMs: 1, feedbackUsedMs: 1,
        })
        .toArray()

    return NextResponse.json({ round, submissions })
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { selectedCandidateIds } = body as { selectedCandidateIds: string[] }
    if (!Array.isArray(selectedCandidateIds) || selectedCandidateIds.length < 2) {
        return NextResponse.json({ error: 'At least 2 candidates required' }, { status: 400 })
    }

    const existing = await Db.peerReviewRounds.findOne({
        courseInstanceId: id,
        status: { $in: ['draft', 'sent', 'unlocked'] },
    })
    if (existing) return NextResponse.json({ error: 'An active round already exists' }, { status: 409 })

    const { rankingMs, feedbackMs } = calcTimers(selectedCandidateIds.length)
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    const round: Omit<PeerReviewRound, '_id'> = {
        courseInstanceId: id,
        status: 'draft',
        selectedCandidateIds,
        candidateCount: selectedCandidateIds.length,
        rankingDurationMs: rankingMs,
        feedbackDurationMs: feedbackMs,
        sentById: me.id,
        sentByName: name,
        createdAt: now,
    }

    const result = await Db.peerReviewRounds.insertOne(round as PeerReviewRound)

    await Db.courseActivityLogs.insertOne({
        courseInstanceId: id,
        action: 'peer_review.round_created',
        performedById: me.id,
        performedByName: name,
        createdAt: now,
    } as CourseActivityLog)

    return NextResponse.json({ round: { ...round, _id: result.insertedId } }, { status: 201 })
}
