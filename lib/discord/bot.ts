/**
 * lib/discord/bot.ts
 *
 * Low-level Discord Bot REST API helpers.
 * Uses the bot token from DISCORD_BOT_TOKEN — no Discord.js dependency.
 *
 * Extend this file for future bot-driven features (role updates, guild queries, etc.)
 */

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

// ─── Internal request helper ──────────────────────────────────────────────────

async function botRequest<T = unknown>(
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

/** Opens (or returns a cached) DM channel with a Discord user. */
async function openDMChannel(userId: string): Promise<string> {
    const cached = dmChannelCache.get(userId)
    if (cached) return cached

    const channel = await botRequest<{ id: string }>('POST', '/users/@me/channels', {
        recipient_id: userId,
    })

    dmChannelCache.set(userId, channel.id)
    return channel.id
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a plain-text or embed DM to a Discord user by their user ID.
 *
 * @example
 * await sendDM('123456789', { content: 'Hello!' })
 * await sendDM('123456789', { embeds: [{ title: 'Reminder', description: 'Op starts in 1 hour' }] })
 */
export async function sendDM(userId: string, payload: MessagePayload): Promise<void> {
    const channelId = await openDMChannel(userId)
    await botRequest('POST', `/channels/${channelId}/messages`, payload)
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

    await sendDM(userId, { embeds: [embed] })
}
