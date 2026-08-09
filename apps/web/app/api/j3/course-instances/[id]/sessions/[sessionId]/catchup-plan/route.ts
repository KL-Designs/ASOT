import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

const DEFAULT_OVERVIEW = 'Provide candidates an opportunity to cover off on sessions and topics that they have previously missed in order to complete the selection process.'

type Params = { params: Promise<{ id: string; sessionId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let plan = await Db.catchUpPlans.findOne({ courseInstanceId: id, sessionId })
    if (!plan) {
        const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
        const blank: Omit<CatchUpPlan, '_id'> = {
            courseInstanceId: id,
            sessionId,
            overview: DEFAULT_OVERVIEW,
            selectedTeachingPoints: [],
            selectedEquipment: [],
            trainingAreaSourceSessionNumber: undefined,
            trainingAreaText: undefined,
            notes: '',
            updatedAt: new Date(),
            updatedById: me.id,
            updatedByName: name,
        }
        const result = await Db.catchUpPlans.insertOne(blank as CatchUpPlan)
        plan = await Db.catchUpPlans.findOne({ _id: result.insertedId })
    }

    return NextResponse.json({ plan })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    const allowed = ['overview', 'selectedTeachingPoints', 'selectedEquipment', 'trainingAreaSourceSessionNumber', 'trainingAreaText', 'notes']
    const update: Record<string, unknown> = { updatedAt: now, updatedById: me.id, updatedByName: name }
    for (const k of allowed) {
        if (k in body) update[k] = body[k]
    }

    await Db.catchUpPlans.updateOne(
        { courseInstanceId: id, sessionId },
        { $set: update },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
