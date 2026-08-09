import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roundId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let oid: ObjectId
    try { oid = new ObjectId(roundId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const body = await req.json()
    const { ranking } = body as { ranking: string[] }
    if (!Array.isArray(ranking)) return NextResponse.json({ error: 'ranking must be an array' }, { status: 400 })

    const now = new Date()
    const result = await Db.peerReviewSubmissions.findOneAndUpdate(
        { roundId, reviewerUserId: me.id, status: { $in: ['started', 'ranking_complete'] } },
        { $set: { ranking, updatedAt: now } },
        { returnDocument: 'after' }
    )
    if (!result) return NextResponse.json({ error: 'Submission not found or not in ranking stage' }, { status: 404 })

    return NextResponse.json({ ok: true })
}
