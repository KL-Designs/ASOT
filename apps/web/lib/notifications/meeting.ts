/**
 * lib/meetingNotifications.ts
 *
 * Helpers that fire a meeting notification immediately:
 *   - Creates an in-app (website) notification
 *   - Sends a Discord DM
 *
 * Use these for events that should deliver right now (meeting created,
 * task assigned).  Time-delayed events (reminder date, chase-up date,
 * attendance overdue) are handled by the meetingNotifQueue + cron instead.
 */

import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendMeetingDM } from '@/lib/discord/bot'

interface NotifOpts {
    type: NotificationType
    title: string
    body: string
    actionUrl: string
    meetingId: string
}

/** Send to one specific user: website notification + Discord DM. */
export async function notifyMeetingUser(userId: string, opts: NotifOpts): Promise<void> {
    await createNotification({
        userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        actionUrl: opts.actionUrl,
        relatedId: opts.meetingId,
    })
    await sendMeetingDM(userId, opts.title, opts.body, opts.actionUrl)
        .catch(err => console.error(`[meetingNotif] Discord DM failed for ${userId}:`, err))
}

/** Send to every member holding a given Discord role: website notifications + Discord DMs. */
export async function notifyMeetingRole(roleName: string, opts: NotifOpts): Promise<void> {
    // Fetch all active users with this role (need both _id for notifications and id for Discord DMs)
    const users = await Db.users
        .find(
            { 'guild.roles': roleName, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { _id: 1, id: 1 } }
        )
        .toArray()

    if (users.length === 0) return

    // Insert website notifications in bulk
    const docs = users.map(u => ({
        userId: u._id.toString(),
        type: opts.type,
        title: opts.title,
        body: opts.body,
        actionUrl: opts.actionUrl,
        relatedId: opts.meetingId,
        createdAt: new Date(),
    } as Notification))
    await Db.notifications.insertMany(docs).catch(err =>
        console.error('[meetingNotif] bulk website notifications failed:', err)
    )

    // Send Discord DMs in parallel using the Discord user ID (u.id)
    await Promise.all(
        users.map(u =>
            sendMeetingDM(u.id as string, opts.title, opts.body, opts.actionUrl)
                .catch(err => console.error(`[meetingNotif] Discord DM failed for role ${roleName}/${u.id}:`, err))
        )
    )
}
