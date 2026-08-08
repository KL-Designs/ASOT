/**
 * TeamSpeak developer mode gate.
 *
 * When TS dev mode is enabled, all group mutations (add/remove) on the TS
 * server are blocked unless the target member's TS UID appears in the
 * TS_OVERRIDE environment variable (comma-separated UIDs).
 *
 * Mirrors the Discord dev mode pattern in lib/discord/bot.ts.
 */

let devModeCache: { enabled: boolean; ts: number } | null = null
const DEV_MODE_TTL_MS = 30_000

async function isTsDevModeEnabled(): Promise<boolean> {
    const now = Date.now()
    if (devModeCache && now - devModeCache.ts < DEV_MODE_TTL_MS) {
        return devModeCache.enabled
    }
    try {
        const Db = (await import('@/lib/mongo')).default
        const setting = await Db.siteSettings.findOne({ _id: 'teamspeakDevMode' })
        const enabled = !!(setting as Record<string, unknown> | null)?.enabled
        devModeCache = { enabled, ts: now }
        return enabled
    } catch {
        // Fail open — never silently break TS features due to a DB error
        devModeCache = { enabled: false, ts: Date.now() }
        return false
    }
}

/** Bust the in-process cache immediately (called after toggling dev mode). */
export function invalidateTsDevModeCache(): void {
    devModeCache = null
}

function isOverrideUid(uid: string): boolean {
    return (process.env.TS_OVERRIDE?.split(',').map(s => s.trim()) ?? []).includes(uid)
}

/**
 * Check whether a TeamSpeak group mutation targeting `uid` should proceed.
 *
 * @param uid The TS unique identifier (permanent alphanumeric UID) of the member being modified.
 * @returns `{ allowed, devMode, override }`
 */
export async function checkTsGate(uid: string): Promise<{
    allowed: boolean
    devMode: boolean
    override: boolean
}> {
    const devMode = await isTsDevModeEnabled()
    if (!devMode) return { allowed: true, devMode: false, override: false }
    const override = isOverrideUid(uid)
    return { allowed: override, devMode: true, override }
}
