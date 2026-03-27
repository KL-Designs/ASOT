export interface ReminderSession {
    message: string
    time: string
    date: string
    repeat: string | null
    channel: string
    userId: string
    pingMe: boolean
    who: string[]
    expiresAt: number
}

const sessions = new Map<string, ReminderSession>()

export function createSession(id: string, data: Omit<ReminderSession, 'expiresAt'>): void {
    sessions.set(id, { ...data, expiresAt: Date.now() + 1000 * 60 * 15 })
}

export function getSession(id: string): ReminderSession | undefined {
    const session = sessions.get(id)
    if (!session) return undefined
    if (Date.now() > session.expiresAt) { sessions.delete(id); return undefined }
    return session
}

export function updateSession(id: string, patch: Partial<ReminderSession>): void {
    const session = sessions.get(id)
    if (session) sessions.set(id, { ...session, ...patch })
}

export function deleteSession(id: string): void {
    sessions.delete(id)
}
