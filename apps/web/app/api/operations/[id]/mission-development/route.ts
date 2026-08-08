import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

type Params = { params: Promise<{ id: string }> }

async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return null
        return me
    } catch { return null }
}

/** POST — save a development check completion */
export async function POST(req: NextRequest, { params }: Params) {
    const me = await authJ2Lead()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    let body: { checkId?: string; reviewerName?: string; comments?: string; outcome?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { checkId, reviewerName, comments, outcome } = body
    if (!checkId) return NextResponse.json({ error: 'checkId required' }, { status: 400 })

    const callerName = (me as any).guild?.displayName || (me as any).guild?.nickname || (me as any).globalName || (me as any).username || 'Unknown'

    const completion: MissionDevCompletion = {
        completedAt: new Date().toISOString(),
        completedBy: me.id,
        completedByName: callerName,
        reviewerName: reviewerName?.trim() || callerName,
        comments: comments?.trim() || undefined,
        outcome: outcome?.trim() || undefined,
    }

    try {
        await Db.operations.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    [`missionDevelopment.completions.${checkId}`]: completion,
                    'missionDevelopment.lastUpdatedAt': new Date().toISOString(),
                    'missionDevelopment.lastUpdatedBy': me.id,
                },
            }
        )
    } catch {
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, completion })
}

/** DELETE — remove a development check completion */
export async function DELETE(req: NextRequest, { params }: Params) {
    const me = await authJ2Lead()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const checkId = new URL(req.url).searchParams.get('checkId')
    if (!checkId) return NextResponse.json({ error: 'checkId required' }, { status: 400 })

    try {
        await Db.operations.updateOne(
            { _id: new ObjectId(id) },
            { $unset: { [`missionDevelopment.completions.${checkId}`]: '' } }
        )
    } catch {
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
