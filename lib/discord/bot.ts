/**
 * lib/discord/bot.ts
 *
 * Single source of truth for all outbound Discord actions (DMs, and future
 * role / nickname mutations). Every action passes through checkDiscordGate()
 * which enforces developer mode and logs every attempt — sent or blocked.
 *
 * Developer mode
 * ──────────────
 * When enabled (toggled via J4 → Tools → Discord Dev Mode), all Discord
 * actions are suppressed EXCEPT for user IDs listed in the OVERRIDE env var.
 * Blocked attempts are still logged so they can be reviewed in J4 Logs.
 *
 * Adding new Discord actions
 * ──────────────────────────
 * 1. Use botRequest() for the raw API call.
 * 2. Call checkDiscordGate(userId) and return early if !gate.allowed.
 * 3. Call logDiscordAction() for both the blocked and sent paths.
 */

import { logDiscord } from '@/lib/logs'

const BASE = 'https://discord.com/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscordEmbed {
    title?: string
    description?: string
    color?: number          // decimal integer, e.g. 0xdb001d = 14352413
    fields?: { name: string; value: string; inline?: boolean }[]
    footer?: { text: string; icon_url?: string }
    timestamp?: string      // ISO 8601
    thumbnail?: { url: string }
}

export interface MessagePayload {
    content?: string
    embeds?: DiscordEmbed[]
}

// ─── Core HTTP helper (exported for reuse in index.ts) ────────────────────────

export async function botRequest<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
): Promise<T> {
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) throw new Error('[discord/bot] DISCORD_BOT_TOKEN is not set')

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'authorization': `Bot ${token}`,
            'content-type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
    })

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`[discord/bot] ${method} ${path} → ${res.status}: ${text}`)
    }

    // 204 No Content
    if (res.status === 204) return undefined as T

    return res.json() as Promise<T>
}

// ─── DM channel cache (in-process, resets on cold start) ─────────────────────

const dmChannelCache = new Map<string, string>() // userId → channelId

async function openDMChannel(userId: string): Promise<string> {
    const cached = dmChannelCache.get(userId)
    if (cached) return cached

    const channel = await botRequest<{ id: string }>('POST', '/users/@me/channels', {
        recipient_id: userId,
    })

    dmChannelCache.set(userId, channel.id)
    return channel.id
}

// ─── Developer mode gate ──────────────────────────────────────────────────────

let devModeCache: { enabled: boolean; ts: number } | null = null
const DEV_MODE_TTL_MS = 30_000 // 30 seconds

async function isDevModeEnabled(): Promise<boolean> {
    const now = Date.now()
    if (devModeCache && now - devModeCache.ts < DEV_MODE_TTL_MS) {
        return devModeCache.enabled
    }
    try {
        // Dynamic import avoids a circular-dep risk at module initialisation time
        const Db = (await import('@/lib/mongo')).default
        const setting = await Db.siteSettings.findOne({ _id: 'discordDevMode' })
        const enabled = !!(setting as Record<string, unknown> | null)?.enabled
        devModeCache = { enabled, ts: now }
        return enabled
    } catch {
        // Fail open — never silently break Discord features due to a DB error
        devModeCache = { enabled: false, ts: Date.now() }
        return false
    }
}

/** Invalidate the in-process cache immediately (called after toggling dev mode). */
export function invalidateDevModeCache(): void {
    devModeCache = null
}

function isOverrideUser(userId: string): boolean {
    return (process.env.OVERRIDE?.split(',').map(s => s.trim()) ?? []).includes(userId)
}

/**
 * Check whether a Discord action targeting `userId` should proceed.
 *
 * Use this at the top of every Discord mutation helper (DMs, role updates,
 * nickname changes, etc.) so dev mode is enforced consistently.
 *
 * @returns `{ allowed, devMode, override }`
 */
export async function checkDiscordGate(userId: string): Promise<{
    allowed: boolean
    devMode: boolean
    override: boolean
}> {
    const devMode = await isDevModeEnabled()
    if (!devMode) return { allowed: true, devMode: false, override: false }
    const override = isOverrideUser(userId)
    return { allowed: override, devMode: true, override }
}

// ─── Internal action logger ───────────────────────────────────────────────────

/** Best-effort user name lookup — falls back to userId if not found. */
async function resolveUserName(userId: string): Promise<string> {
    try {
        const Db = (await import('@/lib/mongo')).default
        const user = await Db.users.findOne({ _id: userId })
        return (user as User | null)?.name ?? (user as User | null)?.globalName ?? userId
    } catch {
        return userId
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a plain-text or embed DM to a Discord user by their user ID.
 * Respects developer mode — blocked messages are logged but not sent.
 * All attempts (sent or blocked) are written to the discord_logs collection.
 *
 * @param messageType  Label stored in the log: 'task' | 'calendar' | 'raw'
 *
 * @example
 * await sendDM('123456789', { content: 'Hello!' })
 * await sendDM('123456789', { embeds: [{ title: 'Reminder' }] }, 'calendar')
 */
export async function sendDM(
    userId: string,
    payload: MessagePayload,
    messageType = 'raw',
): Promise<void> {
    const [gate, targetUserName] = await Promise.all([
        checkDiscordGate(userId),
        resolveUserName(userId),
    ])

    const preview = payload.content ?? payload.embeds?.[0]?.title ?? '(embed)'

    if (!gate.allowed) {
        await logDiscord({
            action: 'dm',
            status: 'blocked',
            targetUserId: userId,
            targetUserName,
            messageType,
            preview,
            embeds: payload.embeds as DiscordLog['embeds'],
            content: payload.content,
            devMode: true,
            override: false,
        })
        return
    }

    try {
        const channelId = await openDMChannel(userId)
        await botRequest('POST', `/channels/${channelId}/messages`, payload)

        await logDiscord({
            action: 'dm',
            status: 'sent',
            targetUserId: userId,
            targetUserName,
            messageType,
            preview,
            embeds: payload.embeds as DiscordLog['embeds'],
            content: payload.content,
            devMode: gate.devMode,
            override: gate.override,
        })
    } catch (err) {
        await logDiscord({
            action: 'dm',
            status: 'failed',
            targetUserId: userId,
            targetUserName,
            messageType,
            preview,
            embeds: payload.embeds as DiscordLog['embeds'],
            content: payload.content,
            devMode: gate.devMode,
            override: gate.override,
        })
        throw err
    }
}

/**
 * Send a calendar reminder DM.
 * Produces a consistently styled embed matching the site's branding.
 */
export async function sendCalendarReminderDM(
    userId: string,
    eventTitle: string,
    label: string,         // e.g. "is starting now" | "is in 1 hour"
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🔔 Event Reminder',
        description: `**${eventTitle}** ${label}.`,
        color: 0xdb001d,   // site red
        footer: { text: 'ASOT Member Portal' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Calendar](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'calendar')
}

/**
 * Send a task-assigned DM.
 * Produces a consistently styled embed matching the site's branding.
 */
export async function sendTaskAssignedDM(
    userId: string,
    title: string,
    description: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '📋 New Task Assigned',
        description: `**${title}**\n${description}`,
        color: 0xdb001d,
        footer: { text: 'ASOT Member Portal' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Task](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'task')
}
