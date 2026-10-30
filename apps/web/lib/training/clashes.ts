/**
 * What else is on when a training is being booked.
 *
 * A trainer picking a time should be told if it lands on a mission night, a
 * J2 mid-week event or another training — the people they want in the session
 * are the same people those take. It is a warning, not a block: two trainings
 * for different sections can sensibly share an evening, and the trainer is the
 * one who knows whether this overlap matters.
 *
 * Pure and import-free: the overlap rule, tested without a database.
 */

export type ClashKind = 'operation' | 'training' | 'calendar'

export interface ClashCandidate {
    kind: ClashKind
    title: string
    start: Date | string
    /** Absent when the thing has no recorded end; `fallbackMinutes` is used. */
    end?: Date | string | null
}

export interface Clash {
    kind: ClashKind
    title: string
    start: string
    end: string
}

/** How long something with no recorded end is taken to run. */
export const DEFAULT_MINUTES: Record<ClashKind, number> = {
    // A mission night: load-in to debrief.
    operation: 180,
    training: 60,
    calendar: 60,
}

const ms = (v: Date | string) => new Date(v).getTime()

/** Two periods overlap when each starts before the other ends. Touching is not overlapping. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && bStart < aEnd
}

/**
 * Everything in `candidates` that overlaps a session starting at `start` and
 * running `durationMinutes`, earliest first.
 *
 * The same thing at the same time is listed once. Missions still in
 * development all arrive under one anonymous title, so five of them on one
 * night read as five identical rows; they become one row that says how many.
 */
export function findClashes(start: Date | string, durationMinutes: number, candidates: readonly ClashCandidate[]): Clash[] {
    const from = ms(start)
    if (Number.isNaN(from)) return []
    const to = from + Math.max(1, durationMinutes) * 60_000

    return candidates
        .map(c => {
            const s = ms(c.start)
            const e = c.end ? ms(c.end) : s + DEFAULT_MINUTES[c.kind] * 60_000
            return { c, s, e: e > s ? e : s + DEFAULT_MINUTES[c.kind] * 60_000 }
        })
        .filter(({ s, e }) => !Number.isNaN(s) && overlaps(from, to, s, e))
        .sort((a, b) => a.s - b.s)
        .map(({ c, s, e }) => ({ kind: c.kind, title: c.title, start: new Date(s).toISOString(), end: new Date(e).toISOString() }))
        .reduce<(Clash & { count: number })[]>((out, clash) => {
            const same = out.find(o => o.kind === clash.kind && o.title === clash.title && o.start === clash.start && o.end === clash.end)
            if (same) same.count += 1
            else out.push({ ...clash, count: 1 })
            return out
        }, [])
        .map(({ count, ...clash }) => count > 1 ? { ...clash, title: `${clash.title} (×${count})` } : clash)
}

export const CLASH_LABEL: Record<ClashKind, string> = {
    operation: 'Mission',
    training: 'Training',
    calendar: 'Calendar event',
}
