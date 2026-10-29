import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { canEditMissionAar, sanitiseMissionAar } from '@/lib/operations/aar-access'
import { actorName, loadAarContext } from '@/lib/operations/aar-context'

/**
 * `PUT /api/operations/{id}/aar/mission` — save one section's shared Mission
 * AAR block (row 328): `{ section, situation, missingCaptured, vehicles }`.
 * Only while the mission maker has it switched on, and only by that section's
 * staff, company HQ, J4, the mission maker or `aar.manage`. Logged.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const operationId = new ObjectId(id)

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await loadAarContext(operationId, me)
    if (!ctx.open) return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    if (!ctx.missionAarEnabled) return NextResponse.json({ error: 'The Mission AAR is not switched on for this operation' }, { status: 403 })

    const body = await req.json().catch(() => null) as { section?: unknown } | null
    const section = typeof body?.section === 'string' ? body.section : ''
    if (!section || !ctx.roster.some(s => s.sectionTitle === section)) return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
    if (!canEditMissionAar(ctx.roster, me.id, section, ctx.standing)) return NextResponse.json({ error: 'Not your section' }, { status: 403 })
    const input = sanitiseMissionAar(body)
    if (!input) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    const now = new Date()
    const name = actorName(me)
    await Db.operationMissionAars.updateOne(
        { operationId, section },
        { $set: { ...input, updatedAt: now, updatedById: me.id, updatedByName: name }, $setOnInsert: { operationId, section } },
        { upsert: true },
    )
    await logAction({
        action: 'operations.aar.missionBlock',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        entityType: 'operationMissionAar',
        entityId: id,
        actionUrl: `/operations/${id}/aar`,
        target: section,
        details: { vehicles: input.vehicles.length },
    })
    return NextResponse.json({ ok: true, updatedAt: now, updatedByName: name })
}
