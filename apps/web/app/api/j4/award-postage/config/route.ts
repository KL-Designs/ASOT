import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { AWARD_POSTAGE_ID, buildPostageDM, sanitisePostageConfig } from '@/lib/military/award-postage'
import { loadPostageConfig } from '@/lib/military/award-postage-db'
import { postageGate } from '../gate'

export const dynamic = 'force-dynamic'

/** GET/PUT /api/j4/award-postage/config — the Automated Message sub-tab. */

async function state() {
    const config = await loadPostageConfig()
    return {
        config: {
            dmTitle: config.dmTitle, dmBody: config.dmBody, imageUrl: config.imageUrl ?? '',
            includeCampaignMedals: config.includeCampaignMedals,
            updatedAt: config.updatedAt ?? null, updatedByName: config.updatedByName ?? null,
        },
        preview: buildPostageDM(config, { name: 'Smith', awards: ['Atlas Award', 'Instructor Award'], baseUrl: process.env.NEXT_PUBLIC_BASEURL ?? '' }).embeds[0],
    }
}

export async function GET() {
    const g = await postageGate()
    if (g.error) return g.error
    return NextResponse.json(await state())
}

export async function PUT(req: NextRequest) {
    const g = await postageGate()
    if (g.error) return g.error
    const result = sanitisePostageConfig(await req.json().catch(() => null))
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    await Db.siteSettings.updateOne(
        { _id: AWARD_POSTAGE_ID },
        { $set: { ...result.config, updatedAt: new Date(), updatedByName: g.actor.name } },
        { upsert: true },
    )
    await logAction({
        action: 'j4.awardPostage.config',
        category: 'award',
        performedBy: g.actor.id,
        performedByName: g.actor.name,
        department: 'j4',
        entityType: 'siteSettings',
        entityId: AWARD_POSTAGE_ID,
        details: { includeCampaignMedals: result.config.includeCampaignMedals, hasImage: !!result.config.imageUrl },
    })
    return NextResponse.json(await state())
}
