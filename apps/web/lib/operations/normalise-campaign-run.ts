/**
 * The database half of campaign normalisation.
 *
 * Split from `normalise-campaign.ts` because that module has to stay pure:
 * `lib/mongo.ts` throws at import time without `MONGO_URI` and opens a
 * connection with it, so anything importing it cannot be unit-tested. The
 * grouping decisions are made there and tested there; this file only carries
 * them out.
 *
 * Lifted verbatim out of `app/api/operations/campaigns/[id]/normalise/route.ts`
 * so the all-campaigns route can run exactly the same pass. Its behaviour is
 * that route's contract — the counts and the order of writes are unchanged.
 */

import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import { planNormalise, type NormalisableOp, type SkipReason } from '@/lib/operations/normalise-campaign'

/** What one campaign's pass did, in enough detail to report it honestly. */
export interface CampaignNormaliseOutcome {
    campaignId: string
    campaignName: string
    /** Ops carrying this campaignId with no campaignMissionId when the pass began. */
    considered: number
    /** Mission groups the titles resolved to. Zero means nothing was numbered. */
    groups: number
    /** New `CampaignMission` records written. */
    created: number
    /** Ops stamped with a campaignMissionId + daySlot. */
    linked: number
    /** Ops left alone, with the title so a reviewer can see which and fix them. */
    skipped: { id: string; title: string; reason: SkipReason }[]
}

/**
 * Group one campaign's unlinked operations into missions and stamp them.
 *
 * Idempotent: it only looks at ops with no `campaignMissionId`, and reuses a
 * mission that already carries the name it would have minted. Re-running after
 * a partial failure picks up where it stopped rather than duplicating missions.
 */
export async function runCampaignNormalise(
    campaign: { _id: ObjectId; name: string },
    createdBy: string,
): Promise<CampaignNormaliseOutcome> {
    const campaignOid = campaign._id
    const id = campaignOid.toString()

    // Only ops with this campaignId that are not yet linked to a CampaignMission.
    const unlinkedOps = await Db.operations
        .find({
            campaignId: campaignOid,
            campaignMissionId: { $exists: false },
            deletedAt: { $exists: false },
        })
        .sort({ date: 1 })
        .toArray()

    const base: CampaignNormaliseOutcome = {
        campaignId: id,
        campaignName: campaign.name,
        considered: unlinkedOps.length,
        groups: 0,
        created: 0,
        linked: 0,
        skipped: [],
    }

    if (unlinkedOps.length === 0) return base

    const byId = new Map(unlinkedOps.map(op => [op._id.toString(), op]))
    const plan = planNormalise(unlinkedOps.map((op): NormalisableOp => ({ id: op._id.toString(), title: op.title })))

    base.groups = plan.groups.length
    base.skipped = plan.skipped.map(s => ({ id: s.op.id, title: s.op.title, reason: s.reason }))

    if (plan.groups.length === 0) return base

    // Existing mission count decides the next sequence number.
    const existingMissions = await Db.campaignMissions
        .find({ campaignId: id })
        .sort({ sequence: 1 })
        .toArray()
    let nextSeq = existingMissions.length + 1

    for (const group of plan.groups) {
        const missionName = `${campaign.name} ${group.roman}`

        const existing = existingMissions.find(m => m.name.toLowerCase() === missionName.toLowerCase())
        let missionId: string

        if (existing) {
            missionId = existing._id?.toString() ?? ''
        } else {
            const result = await Db.campaignMissions.insertOne({
                _id: new ObjectId(),
                campaignId: id,
                name: missionName,
                sequence: nextSeq++,
                ...(group.saturday ? { saturdayOpId: group.saturday.id } : {}),
                ...(group.sunday ? { sundayOpId: group.sunday.id } : {}),
                createdAt: new Date(),
                createdBy,
            })
            missionId = result.insertedId.toString()
            base.created++
        }

        const slots: { id: string; daySlot: string }[] = []
        if (group.saturday) slots.push({ id: group.saturday.id, daySlot: 'saturday' })
        if (group.sunday) slots.push({ id: group.sunday.id, daySlot: 'sunday' })
        if (group.standalone) slots.push({ id: group.standalone.id, daySlot: 'standalone' })

        for (const slot of slots) {
            const op = byId.get(slot.id)
            if (!op) continue
            await Db.operations.updateOne(
                { _id: op._id },
                // The cast is load-bearing and predates this extraction: a
                // campaign mission that ran on one unpaired night is stamped
                // `daySlot: 'standalone'`, a third value the `Operation` type
                // does not model. Dropping the cast would mean either dropping
                // that write — changing what the route does — or widening the
                // shared type, which `board.ts` narrows back to Sat/Sun anyway.
                { $set: { campaignMissionId: missionId, daySlot: slot.daySlot } as Record<string, unknown> }
            )
            base.linked++
        }
    }

    return base
}
