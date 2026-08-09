import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendMeetingDM } from '@/lib/discord/bot'
import PERMISSIONS from '@/lib/permissions'

interface TicketNotifOpts {
    type: NotificationType
    title: string
    body: string
    actionUrl: string
    ticketId: string
}

/** Notify all dept leads (or all members for j4) for a given department. */
export async function notifyTicketDeptLeads(department: string, opts: TicketNotifOpts): Promise<void> {
    const deptKey = department as keyof typeof PERMISSIONS.departmentLeads
    // j4 has no departmentLeads entry (J4-Administration bypasses globally), so fall back to departments.j4
    const leadRoles: string[] | undefined =
        PERMISSIONS.departmentLeads[deptKey] ??
        (department === 'j4' ? PERMISSIONS.departments.j4 : undefined)
    if (!leadRoles || leadRoles.length === 0) return

    const users = await Db.users
        .find(
            { 'guild.roles': { $in: leadRoles }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { _id: 1, id: 1 } }
        )
        .toArray()

    if (users.length === 0) return

    const docs = users.map(u => ({
        userId: u._id.toString(),
        type: opts.type,
        title: opts.title,
        body: opts.body,
        actionUrl: opts.actionUrl,
        relatedId: opts.ticketId,
        createdAt: new Date(),
    } as Notification))

    await Db.notifications.insertMany(docs).catch(err =>
        console.error('[ticketNotif] bulk notifications failed:', err)
    )

    await Promise.all(
        users.map(u =>
            sendMeetingDM(u.id as string, opts.title, opts.body, opts.actionUrl)
                .catch(err => console.error(`[ticketNotif] DM failed for ${u.id}:`, err))
        )
    )
}
