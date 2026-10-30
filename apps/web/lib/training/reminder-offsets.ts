/**
 * When a training's reminders go out, and what they say (row 213).
 *
 * Offsets are minutes before the start. The defaults depend on the course:
 * Selection and the Reinforcement Cycle add a reminder a month ahead of
 * Session 1, because people need to plan around a multi-week course; every
 * training is reminded the day before and thirty minutes before, the second
 * one telling members to be ready to load in fifteen minutes early.
 *
 * Events saved before offsets were stored keep the old 60 and 15 minutes —
 * `LEGACY_OFFSETS` — so nothing already scheduled changes under anybody.
 */

const MINUTE = 1
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

export const SELECTION_OFFSETS = [MONTH, DAY, 30 * MINUTE]
export const TRAINING_OFFSETS = [DAY, 30 * MINUTE]
export const LEGACY_OFFSETS = [60, 15]

/** The 30-minute reminder carries the load-in instruction. */
export const LOAD_IN_OFFSET = 30
export const LOAD_IN_NOTE = 'Be ready to load in in 15 minutes.'

/** Nothing further out than this is accepted: a reminder two months early is a typo. */
export const MAX_OFFSET = 2 * MONTH
export const MAX_REMINDERS = 5

export function defaultReminderOffsets(courseType?: string | null): number[] {
    return courseType === 'selection' || courseType === 'reinforcement_cycle' ? [...SELECTION_OFFSETS] : [...TRAINING_OFFSETS]
}

/**
 * Whatever the client sent, as a clean list: whole minutes, 1 to `MAX_OFFSET`,
 * no repeats, largest first, at most `MAX_REMINDERS`. Null when the input is
 * not a list at all, so a caller can tell "not sent" from "sent empty".
 */
export function sanitiseOffsets(input: unknown): number[] | null {
    if (!Array.isArray(input)) return null
    const clean = new Set<number>()
    for (const v of input) {
        const n = Math.floor(Number(v))
        if (Number.isFinite(n) && n >= 1 && n <= MAX_OFFSET) clean.add(n)
    }
    return [...clean].sort((a, b) => b - a).slice(0, MAX_REMINDERS)
}

function plural(n: number, unit: string): string {
    return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "30 minutes", "1 hour", "1 day", "1 week", "1 month", or the nearest exact unit. */
export function formatOffset(minutes: number): string {
    if (minutes % MONTH === 0) return plural(minutes / MONTH, 'month')
    if (minutes % WEEK === 0) return plural(minutes / WEEK, 'week')
    if (minutes % DAY === 0) return plural(minutes / DAY, 'day')
    if (minutes % HOUR === 0) return plural(minutes / HOUR, 'hour')
    return plural(minutes, 'minute')
}

/** The reminder's sentence, e.g. "BCT 1 starts in 30 minutes. Be ready to load in in 15 minutes." */
export function reminderSentence(title: string, minutesBefore: number): string {
    const base = `${title} starts in ${formatOffset(minutesBefore)}.`
    return minutesBefore === LOAD_IN_OFFSET ? `${base} ${LOAD_IN_NOTE}` : base
}

/**
 * The end a start time suggests: start plus the course's expected duration.
 * Returned as a Date so the form can render it in local time.
 */
export function suggestedEnd(start: Date, durationMinutes: number | undefined): Date {
    const mins = Number.isFinite(durationMinutes) && (durationMinutes ?? 0) > 0 ? durationMinutes! : 60
    return new Date(start.getTime() + mins * 60_000)
}
