import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** Detect day slot from title (handles hyphen, en-dash, em-dash). */
function detectDaySlot(title: string): { stripped: string; day: 'saturday' | 'sunday' | null } {
    const sat = title.match(/\s*[-–—]?\s*(sat|saturday)\s*$/i)
    if (sat) return { stripped: title.slice(0, title.length - sat[0].length).trim(), day: 'saturday' }
    const sun = title.match(/\s*[-–—]?\s*(sun|sunday)\s*$/i)
    if (sun) return { stripped: title.slice(0, title.length - sun[0].length).trim(), day: 'sunday' }
    return { stripped: title, day: null }
}

/** Detect Roman numeral suffix from title. */
function detectRomanSuffix(title: string): { stripped: string; roman: string | null } {
    const m = title.match(/\s+(I{1,3}|IV|VI{0,3}|IX|X)\s*$/i)
    if (m) return { stripped: title.slice(0, title.length - m[0].length).trim(), roman: m[1].toUpperCase() }
    return { stripped: title, roman: null }
}

const ROMAN_ORDER = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

/**
 * POST /api/operations/campaigns/[id]/normalise
 *
 * Inspects ops linked to a campaign with no campaignMissionId, groups them by
 * Roman numeral + day slot from their titles, creates CampaignMission records,
 * and stamps each op with campaignMissionId + daySlot.
 *
 * Safe to run multiple times (skips ops that already have campaignMissionId).
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

    // Only process ops with this campaignId that are not yet linked to a CampaignMission
    const unlinkedOps = await Db.operations
        .find({
            campaignId: campaignOid,
            campaignMissionId: { $exists: false },
            deletedAt: { $exists: false },
        })
        .sort({ date: 1 })
        .toArray()

    if (unlinkedOps.length === 0) {
        return NextResponse.json({ ok: true, created: 0, linked: 0, message: 'No unlinked ops to process' })
    }

    // Group by (romanKey → { roman, day, op })
    type Slot = { op: typeof unlinkedOps[0]; day: 'saturday' | 'sunday' | 'standalone' }
    const groupMap: Record<string, { roman: string; romanIdx: number; sat?: Slot; sun?: Slot; standalone?: Slot }> = {}

    for (const op of unlinkedOps) {
        const { stripped: withoutDay, day } = detectDaySlot(op.title)
        const { stripped: base, roman } = detectRomanSuffix(withoutDay)
        if (!roman) continue // Cannot auto-group ops without Roman numeral suffix

        const key = withoutDay.toLowerCase()
        if (!groupMap[key]) {
            const romanIdx = ROMAN_ORDER.indexOf(roman)
            groupMap[key] = { roman, romanIdx: romanIdx >= 0 ? romanIdx : 99 }
        }
        const slot: Slot = { op, day: day ?? 'standalone' }
        if (day === 'saturday') groupMap[key].sat = slot
        else if (day === 'sunday') groupMap[key].sun = slot
        else groupMap[key].standalone = slot
    }

    // Sort by Roman numeral order
    const groups = Object.entries(groupMap).sort(([, a], [, b]) => a.romanIdx - b.romanIdx)

    if (groups.length === 0) {
        return NextResponse.json({ ok: true, created: 0, linked: 0, message: 'No ops with Roman numeral suffixes found' })
    }

    // Get existing mission count to determine next sequence
    const existingMissions = await Db.campaignMissions
        .find({ campaignId: id })
        .sort({ sequence: 1 })
        .toArray()
    let nextSeq = existingMissions.length + 1

    let created = 0
    let linked = 0

    for (const [, group] of groups) {
        const missionName = `${campaign.name} ${group.roman}`

        // Check if a mission with this name already exists
        const existing = existingMissions.find(m =>
            m.name.toLowerCase() === missionName.toLowerCase()
        )
        let missionId: string

        if (existing) {
            missionId = existing._id?.toString() ?? ''
        } else {
            const satOpId = group.sat?.op._id.toString()
            const sunOpId = group.sun?.op._id.toString()

            const result = await Db.campaignMissions.insertOne({
                _id: new ObjectId(),
                campaignId: id,
                name: missionName,
                sequence: nextSeq++,
                ...(satOpId ? { saturdayOpId: satOpId } : {}),
                ...(sunOpId ? { sundayOpId: sunOpId } : {}),
                createdAt: new Date(),
                createdBy: me.id,
            })
            missionId = result.insertedId.toString()
            created++
        }

        // Stamp each op with campaignMissionId + daySlot
        const slots: Array<{ op: typeof unlinkedOps[0]; daySlot: string }> = []
        if (group.sat) slots.push({ op: group.sat.op, daySlot: 'saturday' })
        if (group.sun) slots.push({ op: group.sun.op, daySlot: 'sunday' })
        if (group.standalone) slots.push({ op: group.standalone.op, daySlot: 'standalone' })

        for (const { op, daySlot } of slots) {
            await Db.operations.updateOne(
                { _id: op._id },
                { $set: { campaignMissionId: missionId, daySlot } as Record<string, unknown> }
            )
            linked++
        }
    }

    return NextResponse.json({ ok: true, created, linked })
}
