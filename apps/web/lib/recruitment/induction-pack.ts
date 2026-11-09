import { absoluteUrl } from '@/lib/absolute-url'
import { fillPlaceholders, selectionDateLine } from '@/lib/training/next-selection'

/**
 * Row 213: the Induction Pack J1 sends a new member, and the website induction
 * it links to. Pure half — the defaults, the DM, and how far someone has got.
 * Sending and saving is `induction-pack-db.ts`.
 */

export const INDUCTION_PACK_ID = 'inductionPack' as const

/** Where the induction lives. Recruits often cannot open the dashboard yet, so it sits under /me. */
export const INDUCTION_PATH = '/me/induction'

/**
 * Rows 348, 349 and 350 are the first three steps rather than a separate
 * Post-BCT walkthrough. J1 can rewrite, reorder or add to them from the
 * Admin view; these are only what a fresh install starts with.
 */
export const DEFAULT_STEPS: InductionStep[] = [
    {
        id: 'attendance',
        title: 'Attendance',
        body: [
            'We expect you to attend operations regularly. If you cannot make one, decline it so your section lead knows not to hold a slot for you.',
            'When sign-ups open, the bot posts the operation in Discord with Attend and Decline buttons. You can also sign up from the operation\'s Attendance page on the website.',
            'Your record of operations attended is shown on your MILPAC, and long gaps without a leave of absence are followed up by your chain of command.',
        ].join('\n\n'),
        links: [{ label: 'Operations', url: '/operations' }],
    },
    {
        id: 'orders',
        title: 'Orders',
        body: [
            'Every operation has orders: the situation, the mission, and how your section fits in. Read them before you load in.',
            'Open an operation from the Operations page; its orders are the first tab. Training sessions carry their own details on the Unit Training Calendar.',
        ].join('\n\n'),
        links: [{ label: 'Operations', url: '/operations' }],
    },
    {
        id: 'milpac',
        title: 'MILPAC',
        body: [
            'Your MILPAC is your service record: rank, uniform, qualifications, awards and operations attended.',
            'It updates as you train and earn qualifications. You can find it from the Members page, or from your profile.',
        ].join('\n\n'),
        links: [{ label: 'Members', url: '/members' }],
    },
]

export const DEFAULT_INDUCTION_PACK: Omit<InductionPackConfig, '_id'> = {
    dmTitle: 'Welcome to ASOT',
    dmBody: [
        'Welcome aboard, {name}.',
        'Start with the member induction. It covers attendance, orders and your MILPAC, and takes a few minutes:\n{inductionUrl}',
        '**Next Selection:** {selectionDate}\nRegister your interest here: {selectionUrl}',
        'Training sessions are on the Unit Training Calendar: {calendarUrl}',
    ].join('\n\n'),
    welcomeText: 'Welcome to the Australian Special Operations Taskforce. Work through the steps below, then register your interest in the next Selection.',
    links: [],
    selectionText: 'Selection is the course that takes you from recruit to fully fledged member. Register your interest and J3 will confirm your place.',
    calendarUrl: '/dashboard/unit/calendar',
    steps: DEFAULT_STEPS,
}

export function withInductionDefaults(doc: Partial<InductionPackConfig> | null | undefined): InductionPackConfig {
    const merged = { _id: INDUCTION_PACK_ID, ...DEFAULT_INDUCTION_PACK, ...(doc ?? {}) } as InductionPackConfig
    // An emptied list means "use the defaults", not "an induction with nothing in it".
    if (!merged.steps?.length) merged.steps = DEFAULT_STEPS
    return merged
}

export interface InductionDMInput {
    name: string
    selectionAt: Date | null
    baseUrl: string
}

export interface InductionDM {
    embeds: {
        title: string
        description: string
        color: number
        image?: { url: string }
        footer: { text: string }
    }[]
}

export function inductionUrls(config: InductionPackConfig, baseUrl: string) {
    const abs = (u: string) => absoluteUrl(u, baseUrl) ?? ''
    return {
        inductionUrl: abs(INDUCTION_PATH),
        // Q4: the Selection link registers interest; J3 then accepts.
        selectionUrl: abs(`${INDUCTION_PATH}#selection`),
        calendarUrl: abs(config.calendarUrl || DEFAULT_INDUCTION_PACK.calendarUrl),
    }
}

export function buildInductionDM(config: InductionPackConfig, input: InductionDMInput): InductionDM {
    const image = absoluteUrl(config.imageUrl, input.baseUrl)
    const description = fillPlaceholders(config.dmBody || DEFAULT_INDUCTION_PACK.dmBody, {
        name: input.name,
        selectionDate: selectionDateLine(input.selectionAt),
        ...inductionUrls(config, input.baseUrl),
    })
    return {
        embeds: [{
            title: config.dmTitle || DEFAULT_INDUCTION_PACK.dmTitle,
            // Discord's embed description limit.
            description: description.slice(0, 4096),
            color: 0xdb001d,
            ...(image ? { image: { url: image } } : {}),
            footer: { text: 'Times are shown in your own timezone' },
        }],
    }
}

/** Who the DM goes to: the Discord account J1 linked, else the one on the application. */
export function inductionRecipient(app: Pick<J1Application, 'linkedUserId' | 'discordId'>): string {
    return (app.linkedUserId || app.discordId || '').trim()
}

export type InductionStatus = 'not_sent' | 'sent' | 'opened' | 'in_progress' | 'completed'

export const INDUCTION_STATUS_LABEL: Record<InductionStatus, string> = {
    not_sent: 'Not sent',
    sent: 'Sent, not opened',
    opened: 'Opened',
    in_progress: 'In progress',
    completed: 'Completed',
}

type ProgressLike = Pick<InductionProgress, 'openedAt' | 'stepsDone' | 'completedAt'> | null | undefined

export function inductionStatus(progress: ProgressLike): InductionStatus {
    if (!progress) return 'not_sent'
    if (progress.completedAt) return 'completed'
    if (progress.stepsDone?.length) return 'in_progress'
    if (progress.openedAt) return 'opened'
    return 'sent'
}

/** Steps done that still exist, in the induction's own order. A removed step no longer counts. */
export function doneSteps(config: Pick<InductionPackConfig, 'steps'>, progress: ProgressLike): string[] {
    const done = new Set(progress?.stepsDone ?? [])
    return config.steps.filter(s => done.has(s.id)).map(s => s.id)
}

export function allStepsDone(config: Pick<InductionPackConfig, 'steps'>, progress: ProgressLike): boolean {
    return doneSteps(config, progress).length === config.steps.length
}

const ID_RE = /^[a-z0-9-]{1,40}$/

/**
 * Check and tidy a config J1 submitted. Returns the cleaned config, or an
 * error to show them. Lengths keep the DM inside Discord's limits.
 */
export function sanitiseInductionPack(body: unknown): { config: Omit<InductionPackConfig, '_id' | 'updatedAt' | 'updatedByName'> } | { error: string } {
    if (!body || typeof body !== 'object') return { error: 'Invalid request body.' }
    const b = body as Record<string, unknown>
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const url = (v: unknown) => {
        const s = str(v, 2000)
        return s && (s.startsWith('/') || /^https?:\/\//i.test(s)) ? s : ''
    }
    const links = (v: unknown) => (Array.isArray(v) ? v : [])
        .map(l => ({ label: str((l as Record<string, unknown>)?.label, 80), url: url((l as Record<string, unknown>)?.url) }))
        .filter(l => l.label && l.url)
        .slice(0, 10)

    const rawSteps = Array.isArray(b.steps) ? b.steps : []
    if (rawSteps.length > 20) return { error: 'An induction can have at most 20 steps.' }
    const steps: InductionStep[] = []
    const seen = new Set<string>()
    for (const raw of rawSteps) {
        const s = (raw ?? {}) as Record<string, unknown>
        const id = str(s.id, 40).toLowerCase()
        const title = str(s.title, 120)
        if (!ID_RE.test(id)) return { error: `Step "${title || id}" needs an id of letters, numbers and dashes.` }
        if (seen.has(id)) return { error: `Two steps share the id "${id}".` }
        if (!title) return { error: 'Every step needs a title.' }
        seen.add(id)
        steps.push({ id, title, body: str(s.body, 4000), links: links(s.links) })
    }

    const dmBody = str(b.dmBody, 3500)
    if (!dmBody) return { error: 'The DM needs some text.' }

    return {
        config: {
            dmTitle: str(b.dmTitle, 200) || DEFAULT_INDUCTION_PACK.dmTitle,
            dmBody,
            welcomeText: str(b.welcomeText, 2000),
            imageUrl: url(b.imageUrl) || undefined,
            links: links(b.links),
            selectionText: str(b.selectionText, 2000),
            calendarUrl: url(b.calendarUrl) || DEFAULT_INDUCTION_PACK.calendarUrl,
            steps: steps.length ? steps : DEFAULT_STEPS,
        },
    }
}
