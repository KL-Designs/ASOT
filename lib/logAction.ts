/**
 * lib/logAction.ts
 *
 * Writes a structured entry to the action_logs collection.
 * Never throws — log failures must not break primary operations.
 */

import Db from '@/lib/mongo'

export interface LogActionInput {
    action: string
    category: ActionCategory
    performedBy: string
    performedByName: string
    department?: string
    entityType?: string
    entityId?: string
    actionUrl?: string
    target?: string
    before?: unknown
    after?: unknown
    details?: Record<string, unknown>
}

export async function logAction(input: LogActionInput): Promise<void> {
    try {
        await Db.actionLogs.insertOne({ ...input, createdAt: new Date() } as ActionLog)
    } catch (err) {
        console.error('[logAction] failed:', err)
    }
}
