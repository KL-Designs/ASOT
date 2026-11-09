import { absoluteUrl } from '@/lib/absolute-url'
import { fillPlaceholders } from '@/lib/training/next-selection'

/**
 * Row 384: J4 Awards and Citation Postage. Pure half — who may open it, which
 * awards are physical, the preference DM, and the month lists. The database
 * and Discord side is `award-postage-db.ts`.
 *
 * Nothing here, or anywhere in this feature, holds a postal detail. The DM
 * asks members to send those to LT GEN Thomas directly.
 */

export const AWARD_POSTAGE_ID = 'awardPostage' as const

/** LT GEN Thomas's Discord account (the issuer recorded on the historic MILPAC imports). */
export const DEFAULT_POSTAGE_OWNER_ID = '224086573560365057'

export function postageOwnerId(env: Record<string, string | undefined> = process.env): string {
    return env.AWARD_POSTAGE_OWNER_ID?.trim() || DEFAULT_POSTAGE_OWNER_ID
}

/**
 * The gate for every route and the page. Deliberately not `hasRoles`, which
 * lets J4-Administration through: only the owner, plus the OVERRIDE env list
 * as the one break-glass (Q10) so the page can be repaired if his account changes.
 */
export function canManagePostage(userId: string | undefined | null, env: Record<string, string | undefined> = process.env): boolean {
    if (!userId) return false
    if (userId === postageOwnerId(env)) return true
    const override = env.OVERRIDE?.split(',').map(s => s.trim()).filter(Boolean) ?? []
    return override.includes(userId)
}

/** Two weeks between preference reminders. */
export const REMINDER_INTERVAL_MS = 14 * 86_400_000
/** How long a new award waits before the DM, so awards given together go in one message. */
export const BATCH_DELAY_MS = 2 * 60_000

export const DEFAULT_POSTAGE_CONFIG: Omit<AwardPostageConfig, '_id'> = {
    dmTitle: 'Physical awards and citations',
    dmBody: [
        'Hey mate,',
        'You are being awarded {awards}.',
        'You have the option to receive the physical citation. It\'s at no cost to you as it\'s covered by the unit funds and myself.',
        'If you\'d like to receive them, please provide the following details:\n- Full name\n- Address\n- Colour case you\'d like',
        'The case colours available are imaged below.',
        'You may provide a PO box instead of your personal address if you didn\'t want to share personal details.',
        'All member details are kept completely private and separate from any ASOT member access including other J4. 🙂',
        'If you dont wish to receive them, thats completely fine. Just let me know and I\'ll note it down for the future so I dont keep pesting you. 😄',
    ].join('\n\n'),
    includeCampaignMedals: false,
}

export function withPostageDefaults(doc: Partial<AwardPostageConfig> | null | undefined): AwardPostageConfig {
    return { _id: AWARD_POSTAGE_ID, ...DEFAULT_POSTAGE_CONFIG, ...(doc ?? {}) } as AwardPostageConfig
}

type AwardLike = { name: string; type?: string; date?: string }

/** Every `milpac.awards` entry is physical, except Campaign Medallions unless they are switched on. */
export function isPhysicalAward(award: AwardLike, config: Pick<AwardPostageConfig, 'includeCampaignMedals'>): boolean {
    if (!award.name?.trim()) return false
    if (!config.includeCampaignMedals && /^campaign medallion/i.test(award.name.trim())) return false
    return true
}

/** Awards in `after` that were not in `before`, matched on name and date (awards carry no id). */
export function addedAwards<T extends AwardLike>(before: AwardLike[] | undefined, after: T[] | undefined): T[] {
    const key = (a: AwardLike) => `${a.name}\u0000${a.date ?? ''}`
    const had = new Set((before ?? []).map(key))
    return (after ?? []).filter(a => !had.has(key(a)))
}

/** 'YYYY-MM' in UTC. */
export function monthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 'October 2026'. */
export function monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Items still open are moved into the current month; `carriedFrom` keeps the first month they were in. */
export function carryOver<T extends Pick<AwardPostageItem, 'month' | 'carriedFrom' | 'status'>>(item: T, current: string): T | null {
    if (item.status !== 'ready' && item.status !== 'awaiting_preference') return null
    if (item.month >= current) return null
    return { ...item, month: current, carriedFrom: item.carriedFrom ?? item.month }
}

export const POSTAGE_STATUS_LABEL: Record<AwardPostageStatus, string> = {
    awaiting_preference: 'Awaiting Member Preference',
    ready: 'Ready to Send',
    sent: 'Sent',
    declined: 'Not Required — Declined',
}

/** "the Atlas Award", "the Atlas Award and the Diplomat Award", "A, B and C". */
export function awardList(names: string[]): string {
    const n = [...new Set(names)].map(x => `**${x}**`)
    if (n.length <= 1) return n[0] ?? 'an award'
    return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

export const POSTAGE_BUTTON_YES = 'award_postage.yes'
export const POSTAGE_BUTTON_NO = 'award_postage.no'

export function buildPostageDM(config: AwardPostageConfig, input: { name: string; awards: string[]; baseUrl: string; reminder?: boolean }) {
    const image = absoluteUrl(config.imageUrl, input.baseUrl)
    const body = fillPlaceholders(config.dmBody || DEFAULT_POSTAGE_CONFIG.dmBody, { name: input.name, awards: awardList(input.awards) })
    return {
        embeds: [{
            title: (input.reminder ? 'Reminder: ' : '') + (config.dmTitle || DEFAULT_POSTAGE_CONFIG.dmTitle),
            description: body.slice(0, 4096),
            color: 0xdb001d,
            ...(image ? { image: { url: image } } : {}),
            footer: { text: 'Send your details to LT GEN Thomas directly. The buttons only record yes or no.' },
        }],
        components: [{
            type: 1,
            components: [
                { type: 2, style: 3, label: 'Yes, send them', custom_id: POSTAGE_BUTTON_YES },
                { type: 2, style: 4, label: 'No thanks', custom_id: POSTAGE_BUTTON_NO },
            ],
        }],
    }
}

export function sanitisePostageConfig(body: unknown): { config: Omit<AwardPostageConfig, '_id' | 'updatedAt' | 'updatedByName'> } | { error: string } {
    if (!body || typeof body !== 'object') return { error: 'Invalid request body.' }
    const b = body as Record<string, unknown>
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const dmBody = str(b.dmBody, 3800)
    if (!dmBody) return { error: 'The message needs some text.' }
    const image = str(b.imageUrl, 2000)
    return {
        config: {
            dmTitle: str(b.dmTitle, 200) || DEFAULT_POSTAGE_CONFIG.dmTitle,
            dmBody,
            imageUrl: image && (image.startsWith('/') || /^https?:\/\//i.test(image)) ? image : '',
            includeCampaignMedals: b.includeCampaignMedals === true,
        },
    }
}
