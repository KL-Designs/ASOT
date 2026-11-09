import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import { sanitiseSettings } from '@/lib/intel/report'
import { intelGate } from '../gate'

/**
 * PUT `/api/operations/{id}/intel/settings` — the report's settings: sharing,
 * carry forward, intel from AARs, approval before publication. Saved on the
 * campaign when the operation has one (so every mission in it agrees), on
 * the operation otherwise. Needs `intel.manage` or ownership.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx, operationId } = gate
    if (!ctx.standing.canManage) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const settings = sanitiseSettings(await req.json().catch(() => null))
    if (!settings) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    if (ctx.position.campaignId) {
        await Db.operationCampaigns.updateOne({ _id: new ObjectId(ctx.position.campaignId) }, { $set: { intelSettings: settings } })
    } else {
        await Db.operations.updateOne({ _id: operationId }, { $set: { intelSettings: settings } })
    }
    await logAction({
        action: 'intel.settings.update',
        category: 'operation',
        performedBy: me.id,
        performedByName: actorName(me),
        entityType: ctx.position.campaignId ? 'operationCampaign' : 'operation',
        entityId: ctx.position.campaignId ?? id,
        actionUrl: `/operations/${id}`,
        details: { ...settings },
    })
    return NextResponse.json({ ok: true, settings })
}
