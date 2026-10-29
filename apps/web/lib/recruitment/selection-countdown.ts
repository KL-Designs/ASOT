import { createHash } from 'crypto'
import { fillPlaceholders, selectionDateLine, type NextSelection } from '@/lib/training/next-selection'
import { absoluteUrl } from '@/lib/absolute-url'

/**
 * Row 212: the Want to Join channel's "next Selection" post. Pure half — what
 * the post says and whether it needs sending. The sync that talks to the
 * database and Discord is `selection-countdown-sync.ts`.
 */

export const SELECTION_COUNTDOWN_ID = 'selectionCountdown' as const

export const DEFAULT_COUNTDOWN: Omit<SelectionCountdownConfig, '_id'> = {
    // Off until J3 turns it on: the Selection system may roll out later.
    enabled: false,
    title: 'NEXT SELECTION',
    text: 'The next ASOT Selection intake begins:\n\n{date}\n\nApply now to be part of it.',
}

export function withDefaults(doc: Partial<SelectionCountdownConfig> | null | undefined): SelectionCountdownConfig {
    return { _id: SELECTION_COUNTDOWN_ID, ...DEFAULT_COUNTDOWN, ...(doc ?? {}) } as SelectionCountdownConfig
}

/**
 * The date the post shows: the manual override while it is still in the
 * future, otherwise the next Selection's Session 1, otherwise none. An expired
 * override is ignored rather than shown.
 */
export function countdownDate(config: Pick<SelectionCountdownConfig, 'overrideAt'>, next: NextSelection | null, now: Date): Date | null {
    const override = config.overrideAt ? new Date(config.overrideAt) : null
    if (override && !isNaN(override.getTime()) && override > now) return override
    return next?.at ?? null
}

export type CountdownPost = {
    embeds: {
        title: string
        description: string
        color: number
        image?: { url: string }
        footer: { text: string }
    }[]
    attachments: []
}

export function buildCountdownPost(config: SelectionCountdownConfig, at: Date | null, baseUrl: string): CountdownPost {
    const image = absoluteUrl(config.imageUrl, baseUrl)
    return {
        embeds: [{
            title: config.title || DEFAULT_COUNTDOWN.title,
            description: fillPlaceholders(config.text || DEFAULT_COUNTDOWN.text, { date: selectionDateLine(at) }),
            color: 0xdb001d,
            ...(image ? { image: { url: image } } : {}),
            footer: { text: 'Times are shown in your own timezone' },
        }],
        // Replaces any attachment an earlier version of the post carried.
        attachments: [],
    }
}

export function fingerprint(channelId: string, post: CountdownPost): string {
    return createHash('sha1').update(channelId).update(JSON.stringify(post)).digest('hex')
}

export type CountdownAction = 'off' | 'unconfigured' | 'unchanged' | 'post' | 'edit'

/** What a sync should do, given the config and the post it would send. */
export function countdownAction(config: SelectionCountdownConfig, channelId: string, nextFingerprint: string): CountdownAction {
    if (!config.enabled) return 'off'
    if (!channelId) return 'unconfigured'
    // A new channel means a new post, not an edit of a message elsewhere.
    if (!config.messageId || config.postedChannelId !== channelId) return 'post'
    return config.postedFingerprint === nextFingerprint ? 'unchanged' : 'edit'
}
