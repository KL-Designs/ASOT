import Db from '@/lib/mongo'

export interface CreateNotificationInput {
    userId: string
    type: NotificationType
    title: string
    body: string
    actionUrl?: string
    relatedId?: string
}

/**
 * Creates a notification for a specific user.
 * Safe to call from any API route — silently swallows errors so a
 * notification failure never breaks the primary operation.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
    try {
        await Db.notifications.insertOne({
            ...input,
            createdAt: new Date(),
        } as Notification)
    } catch (err) {
        console.error('[notifications] Failed to create notification:', err)
    }
}

/**
 * Creates notifications for every user with a given role name.
 * Looks up guild members by role and fans out one notification per user.
 */
export async function createNotificationForRole(
    roleName: string,
    input: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
    try {
        const users = await Db.users
            .find({ 'guild.roles': roleName })
            .project<{ _id: string }>({ _id: 1 })
            .toArray()

        if (users.length === 0) return

        const docs: Notification[] = users.map(u => ({
            userId: u._id.toString(),
            ...input,
            createdAt: new Date(),
        } as Notification))

        await Db.notifications.insertMany(docs)
    } catch (err) {
        console.error('[notifications] Failed to create role notifications:', err)
    }
}
