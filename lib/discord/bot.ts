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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
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
        footer: { text: 'ASOT Dashboard' },
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
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Task](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify a task creator that the assignee has requested a due-date extension.
 */
export async function sendTaskExtensionRequestDM(
    creatorId: string,
    taskTitle: string,
    requesterName: string,
    requestedDate: string,
    reason: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '⏳ Extension Request',
        description: `**${requesterName}** has requested a due-date extension for:\n**${taskTitle}**`,
        color: 0xf59e0b,
        fields: [
            { name: 'Requested date', value: requestedDate, inline: true },
            { name: 'Reason', value: reason, inline: false },
        ],
        footer: { text: 'ASOT Dashboard — approve or deny in Tasks' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '\u200b', value: `[View Task](${base}${actionUrl})`, inline: false })
    }

    await sendDM(creatorId, { embeds: [embed] }, 'task')
}

/**
 * Notify an assignee that their extension request was approved.
 */
export async function sendTaskExtensionApprovedDM(
    userId: string,
    taskTitle: string,
    newDate: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '✅ Extension Approved',
        description: `Your extension request for **${taskTitle}** has been approved.`,
        color: 0x22c55e,
        fields: [{ name: 'New due date', value: newDate, inline: true }],
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '\u200b', value: `[View Task](${base}${actionUrl})`, inline: false })
    }

    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify a trainer that their training session was approved.
 */
export async function sendTrainingApprovedDM(
    userId: string,
    eventTitle: string,
    scheduledAt: string,   // formatted date string
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '✅ Training Session Approved',
        description: `Your training session **${eventTitle}** has been approved.`,
        color: 0x22c55e,
        fields: [{ name: 'Scheduled', value: scheduledAt, inline: true }],
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Event](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'training')
}

/**
 * Notify a trainer that their training session was rejected.
 */
export async function sendTrainingRejectedDM(
    userId: string,
    eventTitle: string,
    reason?: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '❌ Training Session Rejected',
        description: `Your training session **${eventTitle}** was not approved.`,
        color: 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (reason) embed.fields = [{ name: 'Reason', value: reason, inline: false }]
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        const linkField = { name: '​', value: `[View Event](${base}${actionUrl})`, inline: false }
        embed.fields = embed.fields ? [...embed.fields, linkField] : [linkField]
    }
    await sendDM(userId, { embeds: [embed] }, 'training')
}

/**
 * Remind a member that a training session is starting soon.
 */
export async function sendTrainingReminderDM(
    userId: string,
    eventTitle: string,
    minutesBefore: number,
    scheduledAt: string,
    actionUrl?: string,
): Promise<void> {
    const label = minutesBefore <= 15 ? `in ${minutesBefore} minutes` : 'in 1 hour'
    const embed: DiscordEmbed = {
        title: '⏰ Training Reminder',
        description: `**${eventTitle}** starts ${label}.`,
        color: 0xf59e0b,
        fields: [{ name: 'Scheduled', value: scheduledAt, inline: true }],
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Event](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'training')
}

/**
 * Add a Discord guild role to a member.
 * Respects developer mode — blocked attempts are logged but not applied.
 */
export async function addGuildRole(userId: string, roleId: string): Promise<void> {
    const guildId = process.env.DISCORD_GUILD_ID
    if (!guildId) throw new Error('[discord/bot] DISCORD_GUILD_ID is not set')

    const [gate, targetUserName] = await Promise.all([
        checkDiscordGate(userId),
        resolveUserName(userId),
    ])

    const preview = `Add role ${roleId}`

    if (!gate.allowed) {
        await logDiscord({
            action: 'role',
            status: 'blocked',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: true,
            override: false,
        })
        return
    }

    try {
        await botRequest('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`)
        await logDiscord({
            action: 'role',
            status: 'sent',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
    } catch (err) {
        await logDiscord({
            action: 'role',
            status: 'failed',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
        throw err
    }
}

/**
 * Set a guild member's Discord nickname.
 * Respects developer mode — blocked attempts are logged but not applied.
 */
export async function setGuildNickname(userId: string, nick: string): Promise<void> {
    const guildId = process.env.DISCORD_GUILD_ID
    if (!guildId) throw new Error('[discord/bot] DISCORD_GUILD_ID is not set')

    const [gate, targetUserName] = await Promise.all([
        checkDiscordGate(userId),
        resolveUserName(userId),
    ])

    const preview = `Set nickname → ${nick}`

    if (!gate.allowed) {
        await logDiscord({
            action: 'nickname',
            status: 'blocked',
            targetUserId: userId,
            targetUserName,
            messageType: 'nickname',
            preview,
            devMode: true,
            override: false,
        })
        return
    }

    try {
        await botRequest('PATCH', `/guilds/${guildId}/members/${userId}`, { nick })
        await logDiscord({
            action: 'nickname',
            status: 'sent',
            targetUserId: userId,
            targetUserName,
            messageType: 'nickname',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
    } catch (err) {
        await logDiscord({
            action: 'nickname',
            status: 'failed',
            targetUserId: userId,
            targetUserName,
            messageType: 'nickname',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
        throw err
    }
}

/**
 * Remove a Discord guild role from a member.
 * Respects developer mode — blocked attempts are logged but not applied.
 */
export async function removeGuildRole(userId: string, roleId: string): Promise<void> {
    const guildId = process.env.DISCORD_GUILD_ID
    if (!guildId) throw new Error('[discord/bot] DISCORD_GUILD_ID is not set')

    const [gate, targetUserName] = await Promise.all([
        checkDiscordGate(userId),
        resolveUserName(userId),
    ])

    const preview = `Remove role ${roleId}`

    if (!gate.allowed) {
        await logDiscord({
            action: 'role',
            status: 'blocked',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: true,
            override: false,
        })
        return
    }

    try {
        await botRequest('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`)
        await logDiscord({
            action: 'role',
            status: 'sent',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
    } catch (err) {
        await logDiscord({
            action: 'role',
            status: 'failed',
            targetUserId: userId,
            targetUserName,
            messageType: 'role',
            preview,
            devMode: gate.devMode,
            override: gate.override,
        })
        throw err
    }
}

/**
 * Fetch all guild members from Discord, paginated.
 * Returns an array of { userId, roleIds } for every member in the guild.
 * This is a read-only call — not gated by developer mode.
 */
export async function fetchAllGuildMembers(): Promise<Array<{ userId: string; roleIds: string[] }>> {
    const guildId = process.env.DISCORD_GUILD_ID
    if (!guildId) throw new Error('[discord/bot] DISCORD_GUILD_ID is not set')

    const results: Array<{ userId: string; roleIds: string[] }> = []
    let after = '0'

    while (true) {
        const page = await botRequest<Array<{ user: { id: string }; roles: string[] }>>(
            'GET', `/guilds/${guildId}/members?limit=1000&after=${after}`
        )
        if (!page.length) break
        for (const m of page) {
            results.push({ userId: m.user.id, roleIds: m.roles })
        }
        if (page.length < 1000) break
        after = page[page.length - 1].user.id
    }

    return results
}

/**
 * Notify an assignee that their extension request was denied.
 */
export async function sendTaskExtensionDeniedDM(
    userId: string,
    taskTitle: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '❌ Extension Denied',
        description: `Your extension request for **${taskTitle}** was denied.`,
        color: 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Task](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify an assignee that the approver has suggested an alternative due date.
 */
export async function sendTaskExtensionAlternativeDM(
    userId: string,
    taskTitle: string,
    suggestedDate: string,
    note: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🔄 Alternative Due Date Suggested',
        description: `Your extension request for **${taskTitle}** was not approved as requested. An alternative date has been suggested.`,
        color: 0xf59e0b,
        fields: [{ name: 'Suggested date', value: suggestedDate, inline: true }],
        footer: { text: 'ASOT Dashboard — review in Tasks' },
        timestamp: new Date().toISOString(),
    }
    if (note) embed.fields!.push({ name: 'Note from approver', value: note, inline: false })
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify the task creator that an assignee has requested reassignment.
 */
export async function sendTaskReassignmentRequestDM(
    creatorId: string,
    taskTitle: string,
    requesterName: string,
    requestedToName: string,
    reason: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🔁 Reassignment Requested',
        description: `**${requesterName}** has requested reassignment of:\n**${taskTitle}**`,
        color: 0x3b82f6,
        fields: [
            { name: 'Requested assignee', value: requestedToName, inline: true },
            { name: 'Reason', value: reason, inline: false },
        ],
        footer: { text: 'ASOT Dashboard — approve or deny in Tasks' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(creatorId, { embeds: [embed] }, 'task')
}

/**
 * Notify a member about the outcome of a reassignment request.
 * outcome: 'approved' | 'denied' | 'new_assignment'
 */
export async function sendTaskReassignmentOutcomeDM(
    userId: string,
    taskTitle: string,
    outcome: 'approved' | 'denied' | 'new_assignment',
    note: string | null,
    newAssigneeName: string | null,
    actionUrl?: string,
): Promise<void> {
    const configs: Record<string, { title: string; color: number; desc: string }> = {
        approved:       { title: '✅ Reassignment Approved', color: 0x22c55e, desc: `Task **${taskTitle}** has been reassigned to ${newAssigneeName ?? 'the requested member'}.` },
        denied:         { title: '❌ Reassignment Denied',   color: 0xdb001d, desc: `Your reassignment request for **${taskTitle}** was denied.` },
        new_assignment: { title: '📋 New Task Assigned',     color: 0xdb001d, desc: `You have been assigned the task: **${taskTitle}**` },
    }
    const cfg = configs[outcome] ?? configs.denied
    const embed: DiscordEmbed = {
        title: cfg.title,
        description: cfg.desc,
        color: cfg.color,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (note) embed.fields = [{ name: 'Note', value: note, inline: false }]
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        const fields = embed.fields ?? (embed.fields = [])
        fields.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Remind an assignee about an upcoming task (chase-up / reminder date reached).
 */
export async function sendTaskReminderDM(
    userId: string,
    taskTitle: string,
    dueDate: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🔔 Task Reminder',
        description: `You have a task coming up:\n**${taskTitle}**`,
        color: 0xf59e0b,
        fields: [{ name: 'Due', value: dueDate, inline: true }],
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify an assignee that their task is now overdue.
 */
export async function sendTaskOverdueDM(
    userId: string,
    taskTitle: string,
    dueDate: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '⚠️ Task Overdue',
        description: `A task assigned to you is now overdue:\n**${taskTitle}**`,
        color: 0xdb001d,
        fields: [{ name: 'Was due', value: dueDate, inline: true }],
        footer: { text: 'ASOT Dashboard — please action this task immediately' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify a higher-level staff member about a task limit escalation.
 */
export async function sendTaskEscalationDM(
    userId: string,
    memberName: string,
    taskCount: number,
    threshold: number,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '📊 Task Limit Escalation',
        description: `**${memberName}** has reached **${taskCount} incomplete tasks** (threshold: ${threshold}).`,
        color: 0xf97316,
        footer: { text: 'ASOT Dashboard — task limit policy' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '​', value: `[View Member Tasks](${base}${actionUrl})`, inline: false }]
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

/**
 * Notify the task creator that an assignee has requested task deletion.
 */
export async function sendTaskDeleteRequestDM(
    creatorId: string,
    taskTitle: string,
    requesterName: string,
    reason: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🗑️ Task Deletion Requested',
        description: `**${requesterName}** has requested deletion of:\n**${taskTitle}**`,
        color: 0xdb001d,
        fields: [{ name: 'Reason', value: reason || 'No reason provided', inline: false }],
        footer: { text: 'ASOT Dashboard — approve or deny in Tasks' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields!.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(creatorId, { embeds: [embed] }, 'task')
}

/**
 * Notify the assignee of the outcome of their delete request.
 * outcome: 'approved' | 'denied'
 */
export async function sendTaskDeleteOutcomeDM(
    userId: string,
    taskTitle: string,
    outcome: 'approved' | 'denied',
    note: string | null,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: outcome === 'approved' ? '✅ Delete Request Approved' : '❌ Delete Request Denied',
        description: outcome === 'approved'
            ? `Your request to delete **${taskTitle}** was approved. The task has been removed.`
            : `Your request to delete **${taskTitle}** was denied. The task remains active.`,
        color: outcome === 'approved' ? 0x22c55e : 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (note) embed.fields = [{ name: 'Note', value: note, inline: false }]
    if (actionUrl && outcome === 'denied') {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        const fields = embed.fields ?? (embed.fields = [])
        fields.push({ name: '​', value: `[View Task](${base}${actionUrl})`, inline: false })
    }
    await sendDM(userId, { embeds: [embed] }, 'task')
}

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    priority: 'Priority',
    investigating: 'Investigating',
    fixed: 'Fixed',
    implemented: 'Implemented',
    wont_fix: "Won't Fix",
}

/**
 * Send a meeting notification DM (creation, reminder, task chase-up, attendance overdue).
 */
export async function sendMeetingDM(
    userId: string,
    title: string,
    body: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: `📅 ${title}`,
        description: body,
        color: 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '​', value: `[View Meeting](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'meeting')
}

/**
 * Notify a feedback author that someone commented on their submission.
 */
export async function sendFeedbackCommentDM(
    userId: string,
    feedbackTitle: string,
    commenterName: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '💬 New Comment on Your Feedback',
        description: `**${commenterName}** commented on: **${feedbackTitle}**`,
        color: 0x3b82f6,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Feedback](${base}${actionUrl})`, inline: false }]
    }
    await sendDM(userId, { embeds: [embed] }, 'feedback')
}

/**
 * Notify a feedback author that the status of their submission changed.
 */
export async function sendFeedbackStatusDM(
    userId: string,
    feedbackTitle: string,
    newStatus: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '📢 Feedback Status Updated',
        description: `Your feedback **${feedbackTitle}** has been updated to **${FEEDBACK_STATUS_LABELS[newStatus] ?? newStatus}**.`,
        color: 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }
    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Feedback](${base}${actionUrl})`, inline: false }]
    }
    await sendDM(userId, { embeds: [embed] }, 'feedback')
}

/**
 * Send a message to a Discord guild channel by channel ID.
 * Respects developer mode — blocked messages are logged but not sent.
 * Skips silently if channelId is falsy.
 */
export async function sendChannelMessage(
    channelId: string,
    payload: MessagePayload,
    messageType = 'raw',
): Promise<void> {
    if (!channelId) return

    const devMode = await isDevModeEnabled()
    const preview = payload.content ?? payload.embeds?.[0]?.title ?? '(embed)'

    if (devMode) {
        await logDiscord({
            action: 'channel_message',
            status: 'blocked',
            targetUserId: channelId,
            targetUserName: `#channel:${channelId}`,
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
        await botRequest('POST', `/channels/${channelId}/messages`, payload)
        await logDiscord({
            action: 'channel_message',
            status: 'sent',
            targetUserId: channelId,
            targetUserName: `#channel:${channelId}`,
            messageType,
            preview,
            embeds: payload.embeds as DiscordLog['embeds'],
            content: payload.content,
            devMode: false,
            override: false,
        })
    } catch (err) {
        await logDiscord({
            action: 'channel_message',
            status: 'failed',
            targetUserId: channelId,
            targetUserName: `#channel:${channelId}`,
            messageType,
            preview,
            embeds: payload.embeds as DiscordLog['embeds'],
            content: payload.content,
            devMode: false,
            override: false,
        })
        throw err
    }
}

/**
 * Notify a member that they have been nominated as Lead Zeus for an operation.
 */
export async function sendLeadZeusDM(
    userId: string,
    operationTitle: string,
    nominatedBy: string,
    operationUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '⚡ Lead Zeus Nominated',
        description: `You have been nominated as **Lead Zeus** for **${operationTitle}** by ${nominatedBy}.`,
        color: 0x00c3ff,
        footer: { text: 'ASOT Operations' },
        timestamp: new Date().toISOString(),
    }
    if (operationUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '​', value: `[View Operation](${base}${operationUrl})`, inline: false }]
    }
    await sendDM(userId, { embeds: [embed] }, 'operations')
}
