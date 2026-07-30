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
    const { feedback, timedOut } = body as { feedback: Record<string, { text: string; noFeedback: boolean }>; timedOut?: boolean }
    if (!feedback || typeof feedback !== 'object') return NextResponse.json({ error: 'feedback required' }, { status: 400 })

    const now = new Date()
    const updates: Record<string, unknown> = { feedback, updatedAt: now }
    if (timedOut) {
        updates.status = 'time_expired'
        updates.feedbackUsedMs = -1 // will be recalculated on submit
    }

    const result = await Db.peerReviewSubmissions.findOneAndUpdate(
        { roundId, reviewerUserId: me.id, status: { $in: ['feedback_active', 'time_expired'] } },
        { $set: updates },
        { returnDocument: 'after' }
    )
    if (!result) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    return NextResponse.json({ ok: true, status: result.status })
}
