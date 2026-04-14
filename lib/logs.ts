import Db from '@/lib/mongo'

/**
 * Write an action audit log entry. Fire-and-forget — never throws.
 */
export async function logAction(entry: Omit<ActionLog, '_id' | 'createdAt'>): Promise<void> {
    try {
        await Db.actionLogs.insertOne({ ...entry, createdAt: new Date() } as ActionLog)
    } catch (err) {
        console.error('[logs] Failed to write action log:', err)
    }
}

/**
 * Write an error log entry. Fire-and-forget — never throws.
 */
export async function logError(entry: Omit<ErrorLog, '_id' | 'createdAt'>): Promise<void> {
    try {
        await Db.errorLogs.insertOne({ ...entry, createdAt: new Date() } as ErrorLog)
    } catch (err) {
        console.error('[logs] Failed to write error log:', err)
    }
}
