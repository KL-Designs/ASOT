import type { ObjectId } from 'mongodb'

export { }

declare global {

    interface UserPreferences {
        _id?: ObjectId
        userId: string
        /** Custom cursor enabled (default true) */
        cursorCustom: boolean
        /** Per-notification-type toggle. Key = NotificationType string. */
        notifications: Partial<Record<NotificationType, UserNotifPref>>
        updatedAt: Date
    }

    interface UserNotifPref {
        website: boolean
        discord: boolean
    }

    /** J4-controlled policy for a given notification type */
    interface NotifPolicyConfig {
        _id?: ObjectId
        type: NotificationType
        /** If true, website notifications for this type cannot be disabled by user */
        forceWebsite: boolean
        /** If true, Discord notifications for this type cannot be disabled by user */
        forceDiscord: boolean
        updatedById: string
        updatedByName: string
        updatedAt: Date
    }

}
