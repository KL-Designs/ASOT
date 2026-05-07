import Db from '@/lib/mongo'
import notificationEmitter from '@/lib/notifications/emitter'

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
        const doc = { ...input, createdAt: new Date() } as Notification
        const result = await Db.notifications.insertOne(doc)
        notificationEmitter.emit(`user:${input.userId}`, {
            ...doc,
            _id: result.insertedId.toString(),
            createdAt: doc.createdAt.toISOString(),
            readAt: null,
        })
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

        const result = await Db.notifications.insertMany(docs)
        docs.forEach((doc, i) => {
            notificationEmitter.emit(`user:${doc.userId}`, {
                ...doc,
                _id: result.insertedIds[i].toString(),
                createdAt: doc.createdAt.toISOString(),
                readAt: null,
            })
        })
    } catch (err) {
        console.error('[notifications] Failed to create role notifications:', err)
    }
}
