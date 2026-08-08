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
    if (!round || !['sent', 'unlocked'].includes(round.status)) {
        return NextResponse.json({ error: 'Round not available' }, { status: 400 })
    }

    const result = await Db.peerReviewSubmissions.findOneAndUpdate(
        { roundId, reviewerUserId: me.id },
        { $set: { isReady: true, hasOpenedWaitingRoom: true, updatedAt: new Date() } },
        { returnDocument: 'after' }
    )
    if (!result) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    return NextResponse.json({ ok: true, isReady: true })
}
