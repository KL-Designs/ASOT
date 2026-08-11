export interface ReminderSession {
    editId: string | null
    message: string
    expected: number | null
    repeatMs: number
    repeatLabel: string | null
    chaseUpOffset: number | null
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

// Lazy cleanup (in getSession) only fires for sessions someone revisits. This
// sweep catches abandoned setup flows nobody ever clicks a button on again.
setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
        if (now > session.expiresAt) sessions.delete(id)
    }
}, 1000 * 60 * 5)
