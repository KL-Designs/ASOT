import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { grantExpiresAt, preLearningState } from '@/lib/training/pre-learning'

/**
 * `/api/training/pre-learning` — a member's own pre-learning.
 *
 * GET lists every training that has pre-learning with where the caller stands
 * on it: locked, open, done or expired. **The material itself is only in the
 * response while it is open to them.** A locked entry says how many items are
 * waiting and nothing else — this route is the lock, so it cannot hand the
 * links to the page and trust the page not to show them.
 *
 * POST `{ trainingTypeId }` marks the caller's open pre-learning as done.
 */

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [types, grants] = await Promise.all([
        Db.trainingTypes
            .find({ 'preLearning.0': { $exists: true } }, { projection: { name: 1, preLearning: 1 } })
            .toArray(),
        Db.trainingPreLearning.find({ memberId: me.id }).toArray(),
    ])
    const grantByType = new Map(grants.map(g => [g.trainingTypeId, g]))
    const now = new Date()

    return NextResponse.json({
        items: types.map(type => {
            const trainingTypeId = String(type._id)
            const grant = grantByType.get(trainingTypeId) ?? null
            const state = preLearningState(grant, now)
            const open = state === 'open' || state === 'done'
            return {
                trainingTypeId,
                trainingTypeName: type.name,
                state,
                count: type.preLearning?.length ?? 0,
                expiresAt: grant && open ? grantExpiresAt(grant).toISOString() : null,
                completedAt: grant?.completedAt && open ? new Date(grant.completedAt).toISOString() : null,
                material: open ? type.preLearning ?? [] : [],
            }
        }),
    })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const trainingTypeId = typeof body.trainingTypeId === 'string' ? body.trainingTypeId : ''
    if (!ObjectId.isValid(trainingTypeId)) return NextResponse.json({ error: 'Invalid trainingTypeId' }, { status: 400 })

    const grant = await Db.trainingPreLearning.findOne({ trainingTypeId, memberId: me.id })
    const state = preLearningState(grant, new Date())
    // Only something that is open can be finished: not a lock, not a lapse.
    if (state !== 'open' && state !== 'done') {
        return NextResponse.json({ error: 'That pre-learning is not open to you.' }, { status: 403 })
    }

    const completedAt = grant?.completedAt ?? new Date()
    if (!grant?.completedAt) {
        await Db.trainingPreLearning.updateOne({ trainingTypeId, memberId: me.id }, { $set: { completedAt } })
    }
    return NextResponse.json({ ok: true, completedAt: new Date(completedAt).toISOString() })
}
