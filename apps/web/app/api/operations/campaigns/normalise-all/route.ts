import { NextRequest, NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { runCampaignNormalise, type CampaignNormaliseOutcome } from '@/lib/operations/normalise-campaign-run'

/**
 * POST /api/operations/campaigns/normalise-all
 *
 * The per-campaign "⟳ Auto-group N ops" button, run over every campaign at
 * once. J2 has a long tail of campaigns whose operations predate campaign
 * missions being modelled; opening each one and pressing its own button is the
 * job this replaces.
 *
 * It runs exactly the pass `POST /api/operations/campaigns/[id]/normalise`
 * runs — same `runCampaignNormalise`, same idempotence — so the two can never
 * disagree about what a title means.
 *
 * **Sequential, and partial success is reported rather than rolled back.**
 * Same reasoning as `app/api/gallery/admin/bulk/route.ts`: there is no
 * transaction spanning thirty campaigns' worth of inserts and updates, and a
 * user whose twenty-eighth campaign threw is far better served by being told
 * which one than by having the other twenty-seven silently reverted. Each
 * campaign's pass is independent, so one failing says nothing about the rest.
 *
 * The response names every campaign and every op it could not group. A total
 * on its own is the failure mode this endpoint has to avoid: an op with no
 * Roman numeral suffix is ungroupable and is skipped in silence, so "grouped
 * 40" over a run that left 6 behind reads as a clean sweep when it is not.
 */

/** One campaign's line in the report the UI renders. */
interface CampaignReport extends CampaignNormaliseOutcome {
    /** Present only when that campaign's pass threw. The rest still ran. */
    error?: string
}

/** Thirty-odd campaigns, each a handful of sequential indexed writes. Well
 *  inside a minute in practice, but the default budget is sized for a request
 *  that does one query. Matches the gallery bulk route, raised for the same
 *  reason. */
export const maxDuration = 300

export async function POST(_request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const campaigns = await Db.operationCampaigns
        .find({ isDeleted: { $ne: true } })
        .sort({ name: 1 })
        .toArray()

    const reports: CampaignReport[] = []

    for (const campaign of campaigns) {
        try {
            reports.push(await runCampaignNormalise(campaign, me.id))
        } catch (err) {
            // Carry on. A campaign whose ops are malformed must not cost the
            // other twenty-nine their run — this endpoint exists precisely so
            // nobody has to visit them one at a time.
            console.error('[normalise-all] campaign failed:', campaign._id.toString(), err)
            reports.push({
                campaignId: campaign._id.toString(),
                campaignName: campaign.name,
                considered: 0,
                groups: 0,
                created: 0,
                linked: 0,
                skipped: [],
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    const totals = {
        campaigns: reports.length,
        /** Campaigns that had at least one op to consider — what the user counted. */
        campaignsTouched: reports.filter(r => r.considered > 0).length,
        created: reports.reduce((n, r) => n + r.created, 0),
        linked: reports.reduce((n, r) => n + r.linked, 0),
        skipped: reports.reduce((n, r) => n + r.skipped.length, 0),
        failed: reports.filter(r => r.error).length,
    }

    await logAction({
        action: 'operation.campaign.normaliseAll',
        category: 'operation',
        performedBy: me.id,
        performedByName: me.guild?.displayName || me.username || me.id,
        entityType: 'operationCampaign',
        details: {
            ...totals,
            // Only the campaigns that did something or went wrong — logging a
            // line for every untouched campaign buries the ones that matter.
            campaignsDetail: reports
                .filter(r => r.created > 0 || r.linked > 0 || r.skipped.length > 0 || r.error)
                .map(r => ({
                    campaignId: r.campaignId,
                    campaignName: r.campaignName,
                    created: r.created,
                    linked: r.linked,
                    skipped: r.skipped.map(s => s.title),
                    ...(r.error ? { error: r.error } : {}),
                })),
        },
    })

    return NextResponse.json({ ok: true, totals, campaigns: reports })
}
