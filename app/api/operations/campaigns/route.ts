import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { sendMeetingDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'

async function notifyCampaignDeleted(campaign: OperationCampaign, deletedByName: string) {
    const J2_LEAD_ROLES = PERMISSIONS.departmentLeads.j2
    const title = `Campaign Deleted: ${campaign.name}`
    const body = `**${deletedByName}** deleted the campaign **"${campaign.name}"**.\n\nThis campaign has been moved to the Recycle Bin and can be restored via the Campaign Organiser in the J2 Dashboard.`
    const actionUrl = '/dashboard/j2'

    const recipientIds = new Set<string>()

    const leads = await Db.users
        .find({ 'guild.roles': { $in: J2_LEAD_ROLES }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
        .project<{ _id: string; id: string }>({ _id: 1, id: 1 })
        .toArray()
    for (const u of leads) recipientIds.add(u.id as string)
    if (campaign.createdBy) recipientIds.add(campaign.createdBy)

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

async function checkAuth() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return null
        return me
    } catch { return null }
}

/** GET — list campaigns. Pass ?includeDeleted=true to include soft-deleted ones. */
export async function GET(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const query = includeDeleted ? {} : { isDeleted: { $ne: true } }

    const campaigns = await Db.operationCampaigns.find(query).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({ campaigns })
}

/** POST — create a campaign */
export async function POST(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { name, description, startDate, endDate } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Campaign name required' }, { status: 400 })

    const result = await Db.operationCampaigns.insertOne({
        _id: new ObjectId(),
        name: name.trim(),
        description: description?.trim() || undefined,
        createdBy: me.id,
        createdAt: new Date().toISOString(),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
    })
    return NextResponse.json({ id: result.insertedId })
}

/** PATCH — rename / re-describe / restore a campaign */
export async function PATCH(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { id, restore } = body
    if (!id) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })

    const oid = new ObjectId(id)

    if (restore) {
        await Db.operationCampaigns.updateOne(
            { _id: oid },
            { $unset: { isDeleted: '', deletedAt: '', deletedBy: '' } }
        )
        return NextResponse.json({ success: true })
    }

    const { name, description, startDate, endDate } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Campaign name required' }, { status: 400 })

    const updates: Record<string, unknown> = { name: name.trim(), description: description?.trim() || undefined }
    if (startDate !== undefined) updates.startDate = startDate || undefined
    if (endDate !== undefined) updates.endDate = endDate || undefined

    await Db.operationCampaigns.updateOne({ _id: oid }, { $set: updates })
    return NextResponse.json({ success: true })
}

/** DELETE — soft-delete a campaign (keeps ops linked, reversible via PATCH restore) */
export async function DELETE(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })

    const oid = new ObjectId(id)
    const campaign = await Db.operationCampaigns.findOne({ _id: oid })
    const displayName: string = (me as any).displayName ?? (me as any).global_name ?? me.id

    await Db.operationCampaigns.updateOne(
        { _id: oid },
        { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: me.id } }
    )

    if (campaign) {
        notifyCampaignDeleted(campaign as unknown as OperationCampaign, displayName).catch(() => null)
    }

    return NextResponse.json({ success: true })
}
