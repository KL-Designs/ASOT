import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id }, { sort: { createdAt: -1 } })
    if (!round) return NextResponse.json({ submissions: [] })

    const submissions = await Db.peerReviewSubmissions
        .find({ roundId: round._id!.toString() })
        .sort({ reviewerCandidateNumber: 1 })
        .toArray()

    return NextResponse.json({ submissions })
}
