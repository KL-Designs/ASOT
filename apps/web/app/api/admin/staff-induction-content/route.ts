import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

/** GET /api/admin/staff-induction-content — fetch current induction content. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const content = await Db.siteSettings.findOne({ _id: 'staffInductionContent' })
    return NextResponse.json({ content: content ?? null })
}

/** PATCH /api/admin/staff-induction-content — update induction rules/tutorial text. */
export async function PATCH(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { rulesBody, tutorialBody } = body

    if (typeof rulesBody !== 'string') {
        return NextResponse.json({ error: 'rulesBody is required' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const update: Partial<StaffInductionContent> = {
        rulesTitle: 'Staff Rules & Standards',
        rulesBody: rulesBody.trim(),
        tutorialTitle: 'Orientation Tutorial',
        tutorialBody: typeof tutorialBody === 'string' ? tutorialBody.trim() : '',
        updatedAt: new Date(),
        updatedByName: displayName,
    }

    await Db.siteSettings.updateOne(
        { _id: 'staffInductionContent' },
        { $set: update },
        { upsert: true }
    )

    logAction({
        action: 'admin.staffInductionContent.updated',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
    })

    const content = await Db.siteSettings.findOne({ _id: 'staffInductionContent' })
    return NextResponse.json({ content })
}
