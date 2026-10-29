/**
 * When the next Selection starts (rows 212 and 213).
 *
 * Always Session 1 of the next Selection course that has not started yet —
 * never Session 2 or 3 of one already running, and never an expired date. The
 * source is the J3 course instances (`course_instances`, `courseType:
 * 'selection'`); there is no separate date table for Discord.
 *
 * The countdown post and the induction DM both read this, so they can never
 * disagree about the date. Pure; the database read is `find-next-selection.ts`.
 */

export interface NextSelection {
    at: Date
    instanceId: string
    instanceRef: string
}

/** Statuses a course can be in and still be "coming up". */
export const UPCOMING: CourseInstanceStatus[] = ['planning', 'active', 'in_progress']

type InstanceLike = Pick<CourseInstance, 'status' | 'session1Date' | 'instanceRef' | 'courseType' | 'deletedAt'> & { _id?: unknown }

/** The pure choice, for tests: earliest Session 1 strictly after `now`. */
export function pickNextSelection(instances: InstanceLike[], now: Date): NextSelection | null {
    let best: NextSelection | null = null
    for (const i of instances) {
        if (i.courseType !== 'selection' || i.deletedAt || !UPCOMING.includes(i.status) || !i.session1Date) continue
        const at = new Date(i.session1Date)
        if (isNaN(at.getTime()) || at <= now) continue
        if (!best || at < best.at) best = { at, instanceId: String(i._id ?? ''), instanceRef: i.instanceRef }
    }
    return best
}

/** Discord's own timestamp markup: every reader sees it in their own timezone. */
export function discordTimestamp(at: Date, style: 'F' | 'R' | 'f' | 'D' | 't' = 'F'): string {
    return `<t:${Math.floor(at.getTime() / 1000)}:${style}>`
}

export const TO_BE_CONFIRMED = 'To be confirmed'

/** "<date> (<relative>)", or "To be confirmed" when nothing is scheduled. */
export function selectionDateLine(at: Date | null): string {
    return at ? `${discordTimestamp(at, 'F')} (${discordTimestamp(at, 'R')})` : TO_BE_CONFIRMED
}

/**
 * Fill `{placeholders}` in configurable message text. Unknown placeholders are
 * left as written, so a typo shows up in the preview instead of vanishing.
 */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key] : whole))
}
