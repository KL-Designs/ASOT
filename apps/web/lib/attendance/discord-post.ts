import type { SlotView } from '@/lib/attendance/roster'

/**
 * The attendance post the bot puts in Discord when sign-ups open.
 *
 * One message per operation, replacing the sesh bot's: what the operation is,
 * when everything happens (in each reader's own timezone — Discord renders the
 * timestamps), how to get on the server, buttons to sign up or decline without
 * leaving Discord, and a picture of the roster. The roster is a picture because
 * seventy names do not fit in an embed.
 *
 * This file is the *content* of that message and nothing else: what goes in
 * the embed, how the roster is summarised, when the picture counts as changed.
 * It makes no network call and reads no database, so every line of it is
 * tested. `discord-post-sync.ts` decides when to post; `roster-image.tsx`
 * draws the picture.
 */

/* ── Which channel, and the usual timings ───────────────────────────────── */

export type PostKind = 'main' | 'midweek'

/** Minutes relative to the operation's start. Negative is before it. */
export interface PostTimings {
    staffLoadIn: number
    staffBriefing: number
    membersLoadIn: number
    stepOff: number
    missionEnd: number
}

/**
 * The usual running order, used until an operation says otherwise.
 *
 * These are defaults, not policy: an operation's own timings (set on its
 * Attendance tab) replace any of them.
 */
export const DEFAULT_TIMINGS: Record<PostKind, PostTimings> = {
    main: { staffLoadIn: -60, staffBriefing: -45, membersLoadIn: -30, stepOff: 0, missionEnd: 180 },
    midweek: { staffLoadIn: -30, staffBriefing: -20, membersLoadIn: -15, stepOff: 0, missionEnd: 120 },
}

export const TIMING_LABELS: { key: keyof PostTimings; label: string }[] = [
    { key: 'staffLoadIn', label: 'Staff load in' },
    { key: 'staffBriefing', label: 'Staff briefing' },
    { key: 'membersLoadIn', label: 'All members load in' },
    { key: 'stepOff', label: 'Step off' },
    { key: 'missionEnd', label: 'Mission end' },
]

/**
 * A main mission runs on the weekend; anything Monday to Friday is a mid-week.
 * The day is taken in the unit's own timezone — a Saturday-night operation is
 * still Saturday there even where it is already Sunday in UTC.
 */
export function postKindFor(date: Date, timeZone = 'Australia/Sydney'): PostKind {
    const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone }).format(date)
    return day === 'Sat' || day === 'Sun' ? 'main' : 'midweek'
}

/** What an operation can override, and the server details it is posted with. */
export interface PostDetails {
    kind?: PostKind
    timings?: Partial<PostTimings>
    serverAddress?: string
    serverPort?: string
    serverPassword?: string
    modlistUrl?: string
}

export interface ResolvedDetails {
    kind: PostKind
    timings: PostTimings
    serverAddress: string
    serverPort: string
    serverPassword: string
    modlistUrl: string
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const minutes = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 24 * 60 ? Math.round(value) : undefined

/** What somebody typed into the operation's post settings, made safe to store. */
export function sanitiseDetails(raw: unknown): PostDetails {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const out: PostDetails = {}
    if (input.kind === 'main' || input.kind === 'midweek') out.kind = input.kind

    const timings: Partial<PostTimings> = {}
    const given = (input.timings && typeof input.timings === 'object' ? input.timings : {}) as Record<string, unknown>
    for (const { key } of TIMING_LABELS) {
        const value = minutes(given[key])
        if (value !== undefined) timings[key] = value
    }
    if (Object.keys(timings).length) out.timings = timings

    const address = text(input.serverAddress, 100)
    const port = text(input.serverPort, 6).replace(/\D/g, '')
    const password = text(input.serverPassword, 60)
    const modlist = text(input.modlistUrl, 500)
    if (address) out.serverAddress = address
    if (port) out.serverPort = port
    if (password) out.serverPassword = password
    if (/^https?:\/\/\S+$/i.test(modlist)) out.modlistUrl = modlist
    return out
}

/** An operation's own details over the site defaults over the usual timings. */
export function resolveDetails(date: Date, own: PostDetails | null | undefined, defaults: PostDetails = {}): ResolvedDetails {
    const kind = own?.kind ?? postKindFor(date)
    return {
        kind,
        timings: { ...DEFAULT_TIMINGS[kind], ...(defaults.timings ?? {}), ...(own?.timings ?? {}) },
        serverAddress: own?.serverAddress ?? defaults.serverAddress ?? '',
        serverPort: own?.serverPort ?? defaults.serverPort ?? '',
        serverPassword: own?.serverPassword ?? defaults.serverPassword ?? '',
        modlistUrl: own?.modlistUrl ?? defaults.modlistUrl ?? '',
    }
}

/* ── The roster, summarised ─────────────────────────────────────────────── */

export interface RosterSection {
    category: string
    title: string
    /** Everybody in the section who is playing, in slot order. */
    members: { name: string; role: string }[]
    /** Positions in the section, filled or not. */
    total: number
}

export interface RosterSummary {
    sections: RosterSection[]
    gamemasters: string[]
    notAttending: string[]
    attending: number
}

const GAMEMASTER = 'gamemaster'

/**
 * The roster as the picture shows it: each callsign with who is in it, the
 * game masters, and who has said no.
 *
 * A position counts as filled only when somebody is actually going to be in it
 * — held by its own member who said yes, or backfilled. A member who has not
 * answered is not listed: the post is "who is coming", and an unanswered slot
 * is not that yet.
 */
export function summariseRoster(
    slots: readonly SlotView[],
    rsvp: Readonly<Record<string, 'attending' | 'not_attending' | null>>,
    nameOf: (userId: string) => string,
): RosterSummary {
    const sections = new Map<string, RosterSection>()
    const gamemasters: string[] = []
    let attending = 0

    for (const slot of [...slots].sort((a, b) => a.order - b.order)) {
        const playing = slot.occupantUserId && (slot.state === 'held' || slot.state === 'backfilled')
        const name = playing ? nameOf(slot.occupantUserId as string) : null

        if (slot.category === GAMEMASTER) {
            if (name) { gamemasters.push(name); attending++ }
            continue
        }

        const key = `${slot.category}:${slot.sectionTitle}`
        let section = sections.get(key)
        if (!section) {
            section = { category: slot.category, title: slot.sectionTitle || 'Unassigned', members: [], total: 0 }
            sections.set(key, section)
        }
        section.total++
        if (name) { section.members.push({ name, role: slot.role }); attending++ }
    }

    const notAttending = Object.entries(rsvp)
        .filter(([, answer]) => answer === 'not_attending')
        .map(([userId]) => nameOf(userId))
        .sort((a, b) => a.localeCompare(b))

    return { sections: [...sections.values()], gamemasters, notAttending, attending }
}

/**
 * A short string that changes exactly when the picture would. The post's image
 * is redrawn only when this differs from the last one drawn — and then no more
 * often than the refresh interval.
 */
export function rosterFingerprint(summary: RosterSummary): string {
    const flat = JSON.stringify([
        summary.sections.map(s => [s.title, s.total, s.members.map(m => m.name)]),
        summary.gamemasters,
        summary.notAttending,
    ])
    // djb2: this only has to notice a change, not resist anybody.
    let hash = 5381
    for (let i = 0; i < flat.length; i++) hash = ((hash << 5) + hash + flat.charCodeAt(i)) | 0
    return (hash >>> 0).toString(36)
}

/** Whether a changed roster may be redrawn yet: at most once per interval. */
export function refreshDue(lastDrawnAt: Date | string | null | undefined, now: Date, intervalMinutes: number): boolean {
    if (!lastDrawnAt) return true
    return now.getTime() - new Date(lastDrawnAt).getTime() >= Math.max(1, intervalMinutes) * 60_000
}

/* ── The message ────────────────────────────────────────────────────────── */

const unix = (date: Date) => Math.floor(date.getTime() / 1000)
const offset = (date: Date, mins: number) => new Date(date.getTime() + mins * 60_000)

export function formatDuration(totalMinutes: number): string {
    const m = Math.max(0, Math.round(totalMinutes))
    const hours = Math.floor(m / 60), rest = m % 60
    if (!hours) return `${rest} min`
    return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Discord renders `<t:…>` in the reader's own timezone, which is the point. */
const stamp = (date: Date, style: 'F' | 't' | 'R') => `<t:${unix(date)}:${style}>`

export interface PostInput {
    operationId: string
    title: string
    date: Date
    /** When sign-ups close. */
    closesAt: Date
    details: ResolvedDetails
    summary: RosterSummary
    /** Site address, no trailing slash. */
    baseUrl: string
    /** False once sign-ups have closed: the buttons go and the title says so. */
    open: boolean
    /** Accent colour as a hex string. */
    colour?: string
}

export const ROSTER_IMAGE_NAME = 'roster.png'

/** The button ids the bot's handler is registered under: `attendance.<operationId>.<yes|no>`. */
export const buttonId = (operationId: string, answer: 'yes' | 'no') => `attendance.${operationId}.${answer}`

/**
 * The message body Discord is sent, minus the image bytes.
 *
 * Plain JSON in Discord's own shape, so the caller can hand it to a create or
 * an edit unchanged.
 */
export function buildPostMessage(input: PostInput) {
    const { date, details, summary, open } = input
    const t = details.timings
    const stepOff = offset(date, t.stepOff)
    const ordersUrl = `${input.baseUrl}/operations/${input.operationId}`
    const boardUrl = `${ordersUrl}/attendance`

    const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: 'Starts', value: `${stamp(stepOff, 'F')}\n${stamp(stepOff, 'R')}`, inline: true },
        { name: 'Duration', value: formatDuration(t.missionEnd - t.stepOff), inline: true },
        {
            name: open ? 'Sign-ups close' : 'Sign-ups closed',
            value: open ? `${stamp(input.closesAt, 'F')}\n${stamp(input.closesAt, 'R')}` : stamp(input.closesAt, 'F'),
            inline: true,
        },
        {
            name: 'Timings',
            value: TIMING_LABELS.map(({ key, label }) => `${stamp(offset(date, t[key]), 't')}  ${label}`).join('\n'),
        },
    ]

    if (details.serverAddress) {
        const address = details.serverPort ? `${details.serverAddress}:${details.serverPort}` : details.serverAddress
        fields.push({
            name: 'Server',
            // The password sits behind a spoiler so it is not on screen in a
            // shared stream or a screenshot of the channel.
            value: details.serverPassword ? `\`${address}\`\nPassword: ||${details.serverPassword}||` : `\`${address}\``,
            inline: true,
        })
    }
    if (details.modlistUrl) fields.push({ name: 'Modlist', value: `[Open the modlist](${details.modlistUrl})`, inline: true })
    fields.push({ name: 'Orders', value: `[Read the orders](${ordersUrl})`, inline: true })
    fields.push({
        name: 'Signed up',
        value: `${summary.attending} attending · ${summary.notAttending.length} not attending`,
    })

    const colour = /^#[0-9a-f]{6}$/i.test(input.colour ?? '') ? parseInt((input.colour as string).slice(1), 16) : 0xdb001d

    const buttons = open
        ? [
            { type: 2, style: 3, label: 'Attending', custom_id: buttonId(input.operationId, 'yes') },
            { type: 2, style: 4, label: 'Not attending', custom_id: buttonId(input.operationId, 'no') },
            { type: 2, style: 5, label: 'Pick a position on the website', url: boardUrl },
        ]
        : [{ type: 2, style: 5, label: 'View the roster', url: boardUrl }]

    return {
        embeds: [{
            title: open ? input.title.slice(0, 240) : `${input.title.slice(0, 220)} · Sign-ups closed`,
            url: ordersUrl,
            color: colour,
            fields,
            image: { url: `attachment://${ROSTER_IMAGE_NAME}` },
            footer: { text: open ? 'Sign up with the buttons below, or pick a position on the website.' : 'Sign-ups are closed. See your section staff for changes.' },
        }],
        components: [{ type: 1, components: buttons }],
        // Replaces the previous image on an edit instead of stacking a new one.
        attachments: [{ id: 0, filename: ROSTER_IMAGE_NAME }],
        allowed_mentions: { parse: [] as string[] },
    }
}

/* ── Laying the picture out ─────────────────────────────────────────────── */

export const ROSTER_IMAGE = { width: 1200, columns: 4, headHeight: 34, rowHeight: 22, cardGap: 14, emptyRows: 1 } as const

/** How tall a callsign's card is: its heading plus a row per member (one row when empty). */
export function cardHeight(section: Pick<RosterSection, 'members'>): number {
    return ROSTER_IMAGE.headHeight + Math.max(ROSTER_IMAGE.emptyRows, section.members.length) * ROSTER_IMAGE.rowHeight
}

/**
 * The callsigns dealt into columns, each next card going to the shortest
 * column so far. Order within a column is roster order, so a platoon's
 * sections still read top to bottom.
 */
export function packColumns<T extends Pick<RosterSection, 'members'>>(sections: readonly T[], columns: number = ROSTER_IMAGE.columns): { columns: T[][]; height: number } {
    const out: T[][] = Array.from({ length: Math.max(1, columns) }, () => [])
    const heights = out.map(() => 0)
    for (const section of sections) {
        const at = heights.indexOf(Math.min(...heights))
        out[at].push(section)
        heights[at] += cardHeight(section) + ROSTER_IMAGE.cardGap
    }
    return { columns: out, height: Math.max(0, ...heights) }
}
