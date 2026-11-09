import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { actorName, loadAarContext } from '@/lib/operations/aar-context'

/**
 * `POST /api/operations/{id}/aar/settings` — `{ missionAar: boolean }`.
 * The mission maker (or J4) switches the shared Mission AAR block on or off.
 * For an operation in a campaign this is the campaign's setting, so every
 * mission in it follows; otherwise it is the operation's own (row 328).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const operationId = new ObjectId(id)

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ctx = await loadAarContext(operationId, me)
    if (!ctx.operation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!ctx.standing.isMissionMaker && !ctx.standing.isJ4) return NextResponse.json({ error: 'Only the mission maker can change this' }, { status: 403 })

    const body = await req.json().catch(() => null) as { missionAar?: unknown } | null
    if (typeof body?.missionAar !== 'boolean') return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
    const enabled = body.missionAar

    if (ctx.hasCampaign && ctx.operation.campaignId) {
        await Db.operationCampaigns.updateOne({ _id: new ObjectId(String(ctx.operation.campaignId)) }, { $set: { missionAarEnabled: enabled } })
    } else {
        await Db.operations.updateOne({ _id: operationId }, { $set: { missionAarEnabled: enabled } })
    }
    await logAction({
        action: 'operations.aar.missionToggle',
        category: 'operation',
        performedBy: me.id,
        performedByName: actorName(me),
        entityType: ctx.hasCampaign ? 'operationCampaign' : 'operation',
        entityId: ctx.hasCampaign ? String(ctx.operation.campaignId) : id,
        actionUrl: `/operations/${id}/aar`,
        details: { enabled },
    })
    return NextResponse.json({ ok: true, enabled })
}
