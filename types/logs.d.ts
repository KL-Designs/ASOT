import type { ObjectId } from 'mongodb'

export { }

declare global {

    type ActionCategory = 'orbat' | 'calendar' | 'member' | 'operation' | 'system' | 'discord'

    interface ActionLog {
        _id: ObjectId
        action: string            // e.g. 'orbat.assign', 'calendar.create'
        category: ActionCategory
        performedBy: string       // userId
        performedByName: string
        target?: string           // human-readable description of what changed
        details?: Record<string, unknown>
        createdAt: Date
    }

    interface ErrorLog {
        _id: ObjectId
        path: string
        method: string
        message: string
        stack?: string
        userId?: string
        userDisplayName?: string
        createdAt: Date
    }

    type DiscordLogStatus = 'sent' | 'blocked' | 'failed'

    interface DiscordLog {
        _id: ObjectId
        /** 'dm' | 'role' | 'nickname' — the kind of Discord action attempted */
        action: string
        status: DiscordLogStatus
        targetUserId: string
        targetUserName: string      // resolved from DB; falls back to userId
        /** 'task' | 'calendar' | 'raw' | 'role' | 'nickname' */
        messageType: string
        /** Embed title or first line of content — shown in the list row */
        preview: string
        /** Full embed array (if DM) */
        embeds?: import('mongodb').Document[]
        /** Raw text content (if DM without embed) */
        content?: string
        devMode: boolean
        override: boolean           // sent despite dev mode (OVERRIDE user)
        createdAt: Date
    }

}
