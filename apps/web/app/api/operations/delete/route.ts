import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'
import { sendMeetingDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'

/**
 * Tell the J2 leads a mission has gone to the recycle bin.
 *
 * Deleting a campaign already did this (`notifyCampaignDeleted`); deleting a
 * single mission did not, so one could vanish from the board with nobody in J2
 * knowing until it was looked for. The bin holds it for 30 days, which is only
 * useful to somebody who knows to look there.
 *
 * The person who deleted it is left out — they know.
 */
async function notifyMissionDeleted(title: string, deletedById: string, deletedByName: string) {
    const notifTitle = `Mission Deleted: ${title}`
    const body = `**${deletedByName}** deleted the mission **"${title}"**.

It has been moved to the Recycle Bin on the J2 Operations tab and can be restored from there within 30 days.`
    const actionUrl = '/dashboard/j2'

    const leads = await Db.users
        .find({ 'guild.roles': { $in: PERMISSIONS.departmentLeads.j2 }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
        .project<{ _id: string; id: string }>({ _id: 1, id: 1 })
        .toArray()
    const recipients = leads.filter(u => u.id !== deletedById)

    await Promise.all(recipients.map(u =>
        createNotification({ userId: u._id.toString(), type: 'system', title: notifTitle, body, actionUrl })
    ))
    await Promise.all(recipients.map(u =>
        sendMeetingDM(u.id, notifTitle, body, actionUrl).catch(() => null)
    ))
}


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Mission ID Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const op = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { title: 1 } })

        await Db.operations.updateOne(
            { _id: new ObjectId(id) },
            { $set: { deletedAt: new Date(), deletedBy: me.id, deletedByName: me.guild.displayName } }
        )

        const deleterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        logAction({
            action: 'operation.delete',
            category: 'operation',
            performedBy: me.id,
            performedByName: deleterName,
            target: op?.title ?? id,
            details: { operationId: id },
        })

        // Not awaited into the response: a failed DM must not turn a
        // successful delete into an error the mission maker retries.
        notifyMissionDeleted(op?.title ?? 'Untitled mission', me.id, deleterName)
            .catch(err => console.error('[operation.delete] J2 lead notification failed:', err))

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}