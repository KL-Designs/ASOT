import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { findNextSelection } from '@/lib/training/find-next-selection'
import { INDUCTION_PACK_ID, buildInductionDM, sanitiseInductionPack } from '@/lib/recruitment/induction-pack'
import { loadInductionPack } from '@/lib/recruitment/induction-pack-db'

export const dynamic = 'force-dynamic'

/**
 * Row 213: J1 → Admin → Induction Pack. GET (any J1 member) returns the
 * settings, a preview of the DM and how far sent members have got. PUT saves
 * the settings, J1 leads only, the same people who edit the Recruit Video.
 */

async function state(canEdit: boolean) {
    const [config, next, counts] = await Promise.all([
        loadInductionPack(),
        findNextSelection(),
        Promise.all([
            Db.inductionProgress.countDocuments({}),
            Db.inductionProgress.countDocuments({ openedAt: { $exists: true } }),
            Db.inductionProgress.countDocuments({ completedAt: { $exists: true } }),
            Db.inductionProgress.countDocuments({ selectionInterest: { $exists: true } }),
        ]),
    ])
    return {
        config: {
            dmTitle: config.dmTitle, dmBody: config.dmBody, welcomeText: config.welcomeText, imageUrl: config.imageUrl ?? '',
            links: config.links, selectionText: config.selectionText, calendarUrl: config.calendarUrl, steps: config.steps,
            updatedAt: config.updatedAt ?? null, updatedByName: config.updatedByName ?? null,
        },
        canEdit,
        next: next ? { at: next.at, instanceRef: next.instanceRef } : null,
        preview: buildInductionDM(config, { name: 'Recruit', selectionAt: next?.at ?? null, baseUrl: process.env.NEXT_PUBLIC_BASEURL ?? '' }).embeds[0],
        stats: { sent: counts[0], opened: counts[1], completed: counts[2], selectionInterest: counts[3] },
    }
}

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(await state(await hasPermission(me, 'departmentLeads.j1')))
}

export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'departmentLeads.j1'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
    const result = sanitiseInductionPack(body)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const name = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const before = await loadInductionPack()
    const fields = result.config
    await Db.siteSettings.updateOne(
        { _id: INDUCTION_PACK_ID },
        { $set: { ...fields, imageUrl: fields.imageUrl ?? '', updatedAt: new Date(), updatedByName: name } },
        { upsert: true },
    )

    await logAction({
        action: 'j1.inductionPack.update',
        category: 'member',
        performedBy: me._id,
        performedByName: name,
        department: 'j1',
        entityType: 'siteSettings',
        entityId: INDUCTION_PACK_ID,
        before: { dmTitle: before.dmTitle, dmBody: before.dmBody, steps: before.steps.map(s => s.id) },
        after: { dmTitle: fields.dmTitle, dmBody: fields.dmBody, steps: fields.steps.map(s => s.id) },
    })
    return NextResponse.json(await state(true))
}
