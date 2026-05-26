import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { sendMeetingDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'

async function notifyMissionDeleted(mission: CampaignMission, deletedByName: string) {
    const J2_LEAD_ROLES = PERMISSIONS.departmentLeads.j2
    const title = `Mission Deleted: ${mission.name}`
    const body = `**${deletedByName}** deleted the campaign mission **"${mission.name}"**.\n\nThis mission has been moved to the Recycle Bin and can be restored via the Campaign Organiser in the J2 Dashboard.`
    const actionUrl = '/dashboard/j2'

    // Collect recipient IDs (leads + creator), deduplicated
    const recipientIds = new Set<string>()

    // J2 leads
    const leads = await Db.users
        .find({ 'guild.roles': { $in: J2_LEAD_ROLES }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
        .project<{ _id: string; id: string }>({ _id: 1, id: 1 })
        .toArray()
    for (const u of leads) recipientIds.add(u.id as string)

    // Campaign creator
    if (mission.createdBy) recipientIds.add(mission.createdBy)
    // Look up campaign creator
    const campaign = await Db.operationCampaigns.findOne({ _id: new ObjectId(mission.campaignId) })
    if (campaign?.createdBy) recipientIds.add(campaign.createdBy)

    // Get DB user docs for in-app notifications
    const userDocs = await Db.users
        .find({ id: { $in: [...recipientIds] } })
        .project<{ _id: string; id: string }>({ _id: 1, id: 1 })
        .toArray()

    await Promise.all(userDocs.map(u =>
        createNotification({ userId: u._id.toString(), type: 'system', title, body, actionUrl })
    ))
    await Promise.all([...recipientIds].map(discordId =>
        sendMeetingDM(discordId, title, body, actionUrl).catch(() => null)
    ))
}

/** PATCH — update mission name, sequence, or restore from soft-delete */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    let missionId: ObjectId
    try {
        missionId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const body = await request.json()

    if (body.restore) {
        await Db.campaignMissions.updateOne(
            { _id: missionId },
            { $unset: { isDeleted: '', deletedAt: '', deletedBy: '', deletedByName: '' } }
        )
        return NextResponse.json({ ok: true })
    }

    const updateFields: Record<string, unknown> = {}
    if (body.name !== undefined) updateFields.name = body.name
    if (body.sequence !== undefined) updateFields.sequence = body.sequence

    if (Object.keys(updateFields).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await Db.campaignMissions.updateOne({ _id: missionId }, { $set: updateFields })
    return NextResponse.json({ ok: true })
}

/** DELETE — soft-delete mission (moved to Recycle Bin, ops unlinked, notifications sent) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    let missionId: ObjectId
    try {
        missionId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    // Find the mission first
    const mission = await Db.campaignMissions.findOne({ _id: missionId })
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const displayName: string = (me as any).displayName ?? (me as any).global_name ?? me.id

    // Unlink operations (leave them in place, just remove campaign link)
    if (mission.saturdayOpId) {
        try {
            await Db.operations.updateOne(
                { _id: new ObjectId(mission.saturdayOpId) },
                { $unset: { campaignMissionId: '', daySlot: '', campaignId: '' } }
            )
        } catch { /* ignore */ }
    }
    if (mission.sundayOpId) {
        try {
            await Db.operations.updateOne(
                { _id: new ObjectId(mission.sundayOpId) },
                { $unset: { campaignMissionId: '', daySlot: '', campaignId: '' } }
            )
        } catch { /* ignore */ }
    }

    // Soft-delete
    await Db.campaignMissions.updateOne(
        { _id: missionId },
        { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: me.id, deletedByName: displayName } }
    )

    // Notify asynchronously — don't let it block the response
    notifyMissionDeleted({ ...mission, createdBy: mission.createdBy }, displayName).catch(() => null)

    return NextResponse.json({ ok: true })
}
