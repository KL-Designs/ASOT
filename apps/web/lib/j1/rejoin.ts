/**
 * Whether somebody who has left the unit is welcome back.
 *
 * Three outcomes, which J1 has always worked in:
 *
 *   HD — welcome back: carry on with the application as normal.
 *   GD — to be reviewed: the recruiter looks at the history first, and can ask
 *        J4 for a second opinion.
 *   DD — not welcome: J4 must clear it before anything proceeds.
 *
 * Normally the outcome follows from the discharge type. J4 can now also set it
 * outright when discharging somebody (`rejoinStatus`), because the type and
 * the answer do not always agree — a general discharge of somebody the unit
 * would gladly have back, or an honourable one with a private reason not to.
 * When it is set, it wins.
 *
 * Pure and import-free: the discharge forms, the API and the tests all read
 * the same rule.
 */

export type ReturningLevel = 'CLEAR' | 'HD' | 'GD' | 'DD'
export type RejoinStatus = 'welcome' | 'review' | 'not_welcome'

export const REJOIN_STATUSES: readonly RejoinStatus[] = ['welcome', 'review', 'not_welcome']

export const REJOIN_LABEL: Record<RejoinStatus, string> = {
    welcome: 'Welcome back',
    review: 'To be reviewed',
    not_welcome: 'Not welcome',
}

const LEVEL_FOR_REJOIN: Record<RejoinStatus, ReturningLevel> = { welcome: 'HD', review: 'GD', not_welcome: 'DD' }

export function isRejoinStatus(value: unknown): value is RejoinStatus {
    return typeof value === 'string' && (REJOIN_STATUSES as readonly string[]).includes(value)
}

/**
 * The outcome for one discharge.
 *
 * The type arrives in two spellings and both have to work: the site's own
 * discharge tickets store `honorable` / `general` / `dishonorable`, while
 * records imported from the old master sheet store `HD` / `GD` / `DD`. This
 * used to compare against the abbreviations only, so every discharge made on
 * the site — honourable ones included — read as a general discharge.
 *
 * Anything unrecognised is treated as to-be-reviewed: an unknown history is a
 * reason to look, not a reason to wave through or to refuse.
 */
export function dischargeLevel(type: unknown, rejoinStatus?: unknown): Exclude<ReturningLevel, 'CLEAR'> {
    if (isRejoinStatus(rejoinStatus)) return LEVEL_FOR_REJOIN[rejoinStatus] as Exclude<ReturningLevel, 'CLEAR'>

    const t = typeof type === 'string' ? type.trim().toUpperCase() : ''
    if (t === 'DD' || t.startsWith('DISHON')) return 'DD'
    if (t === 'HD' || t.startsWith('HON')) return 'HD'
    return 'GD'
}

/** The rejoin status a discharge form should start on for a discharge type. */
export function defaultRejoinStatus(type: unknown): RejoinStatus {
    const level = dischargeLevel(type)
    return level === 'HD' ? 'welcome' : level === 'DD' ? 'not_welcome' : 'review'
}

const PRIORITY: Record<ReturningLevel, number> = { CLEAR: 0, HD: 1, GD: 2, DD: 3 }

/** The more cautious of two outcomes. */
export function worseLevel(a: ReturningLevel, b: ReturningLevel): ReturningLevel {
    return PRIORITY[b] > PRIORITY[a] ? b : a
}

/** How each outcome reads to a recruiter. */
export const LEVEL_LABEL: Record<ReturningLevel, string> = {
    CLEAR: 'No prior record',
    HD: 'Welcome back',
    GD: 'To be reviewed',
    DD: 'Not welcome',
}
