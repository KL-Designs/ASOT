import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { runCampaignNormalise } from '@/lib/operations/normalise-campaign-run'

/**
 * POST /api/operations/campaigns/[id]/normalise
 *
 * Inspects ops linked to a campaign with no campaignMissionId, groups them by
 * Roman numeral + day slot from their titles, creates CampaignMission records,
 * and stamps each op with campaignMissionId + daySlot.
 *
 * Safe to run multiple times (skips ops that already have campaignMissionId).
 *
 * The pass itself lives in `lib/operations/normalise-campaign-run.ts` because
 * `POST /api/operations/campaigns/normalise-all` runs the same one over every
 * campaign, and a route file may not export a helper for another route to
 * import — under `typedRoutes` that compiles and then fails `npm run build`.
 * The response shape below is unchanged.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let campaignOid: ObjectId
    try {
        campaignOid = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })
    }

    const campaign = await Db.operationCampaigns.findOne({ _id: campaignOid })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const outcome = await runCampaignNormalise(campaign, me.id)

    if (outcome.considered === 0) {
        return NextResponse.json({ ok: true, created: 0, linked: 0, message: 'No unlinked ops to process' })
    }
    if (outcome.groups === 0) {
        return NextResponse.json({ ok: true, created: 0, linked: 0, message: 'No ops with Roman numeral suffixes found' })
    }

    return NextResponse.json({ ok: true, created: outcome.created, linked: outcome.linked })
}
