import type { ObjectId } from 'mongodb'

export { }

declare global {

    type ActionCategory =
        | 'orbat'
        | 'calendar'
        | 'member'
        | 'operation'
        | 'system'
        | 'discord'
        | 'meeting'
        | 'ticket'
        | 'task'
        | 'training'
        | 'award'

    interface ActionLog {
        _id: ObjectId
        action: string                  // e.g. 'meeting.create', 'meeting.transfer', 'ticket.status_change'
        category: ActionCategory
        performedBy: string             // Discord userId
        performedByName: string
        department?: string             // dept this action belongs to (for dept-level filtering)
        entityType?: string             // 'meeting' | 'task' | 'ticket' | 'calendar' | 'member' etc.
        entityId?: string               // ID of the related entity (for navigation)
        actionUrl?: string              // URL to navigate to when clicking this log entry
        target?: string                 // human-readable description of what changed
        before?: unknown                // value before change (for edits)
        after?: unknown                 // value after change (for edits)
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
        action: string
        status: DiscordLogStatus
        targetUserId: string
        targetUserName: string
        messageType: string
        preview: string
        embeds?: import('mongodb').Document[]
        content?: string
        devMode: boolean
        override: boolean
        createdAt: Date
    }

}
