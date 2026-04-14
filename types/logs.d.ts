import type { ObjectId } from 'mongodb'

export { }

declare global {

    type ActionCategory = 'orbat' | 'calendar' | 'member' | 'operation' | 'system'

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

}
