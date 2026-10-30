/**
 * Pre-learning: material a member works through before a training session.
 *
 * A training type can carry pre-learning — a video, a document — that stays
 * locked until the member has a place on a session of that training:
 *
 *  1. **Who is unlocked.** Everybody with a confirmed trainee seat, and the
 *     first two on the waitlist. Deeper in the waitlist, the odds of getting a
 *     seat are too low to be worth handing the material out for.
 *  2. **Moving up.** Somebody who moves into that range (a seat frees up, the
 *     queue shortens) is unlocked then, and told.
 *  3. **It expires.** Access lasts two weeks from the moment it unlocked. A
 *     member who does not attend inside that window loses it and starts again
 *     the next time they sign up — the material is meant to be fresh when they
 *     sit the session.
 *  4. **Priority.** Somebody who finished the pre-learning but missed their
 *     session goes to the front of the queue for another session of the same
 *     training, as long as that session falls inside their two weeks.
 *
 * Pure and import-free: every rule above is a function here, tested without a
 * database. `pre-learning-sync.ts` is the half that reads and writes.
 */

export const PRE_LEARNING_WINDOW_DAYS = 14
/** How far down the waitlist pre-learning is handed out. */
export const WAITLIST_UNLOCKED = 2

const WINDOW_MS = PRE_LEARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000

export interface SeatRecord {
    memberId: string
    slotType?: string | null
    rsvpStatus: 'attending' | 'not_attending' | 'waitlist'
    /** Set on a waitlisted record that earned the front of the queue. */
    priority?: boolean
    createdAt: Date | string
}

/** Records written before slot types existed are trainees. */
const isTrainee = (r: SeatRecord) => !r.slotType || r.slotType === 'trainee'
const time = (v: Date | string) => new Date(v).getTime()

/**
 * The trainee waitlist, in the order seats are offered: priority first, then
 * first come first served. This is the one definition of "who is next" — the
 * sign-up route promotes from it and the unlock rule counts down it, so the
 * two can never disagree about who is second in the queue.
 */
export function waitlistOrder<T extends SeatRecord>(records: readonly T[]): T[] {
    return records
        .filter(r => isTrainee(r) && r.rsvpStatus === 'waitlist')
        .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || time(a.createdAt) - time(b.createdAt))
}

/** Everybody on this session whose pre-learning should be open (rules 1 and 2). */
export function unlockedMemberIds(records: readonly SeatRecord[]): string[] {
    const seated = records.filter(r => isTrainee(r) && r.rsvpStatus === 'attending').map(r => r.memberId)
    const queued = waitlistOrder(records).slice(0, WAITLIST_UNLOCKED).map(r => r.memberId)
    return [...new Set([...seated, ...queued])]
}

export interface PreLearningGrant {
    unlockedAt: Date | string
    /** The session whose seat unlocked it. */
    eventId: string
    completedAt?: Date | string | null
}

export function grantExpiresAt(grant: Pick<PreLearningGrant, 'unlockedAt'>): Date {
    return new Date(time(grant.unlockedAt) + WINDOW_MS)
}

/** Still inside its two weeks (rule 3)? */
export function grantIsLive(grant: Pick<PreLearningGrant, 'unlockedAt'> | null | undefined, now: Date): boolean {
    return !!grant && now.getTime() < grantExpiresAt(grant).getTime()
}

export type PreLearningState = 'locked' | 'open' | 'done' | 'expired'

/**
 * What a member sees for one training's pre-learning.
 *
 * `expired` is only ever reported for the member's most recent grant — it is
 * there so the page can say "this lapsed, sign up again", which is more use
 * than a silent return to "locked".
 */
export function preLearningState(grant: PreLearningGrant | null | undefined, now: Date): PreLearningState {
    if (!grant) return 'locked'
    if (!grantIsLive(grant, now)) return 'expired'
    return grant.completedAt ? 'done' : 'open'
}

/**
 * Does this member go to the front of the queue for this session (rule 4)?
 *
 * They must have finished the pre-learning, still be inside its window, be
 * signing up to a *different* session from the one that unlocked it — the one
 * they missed — and that new session must itself start before the window
 * closes. Otherwise finishing the material once would be a permanent queue
 * jump.
 */
export function hasSeatPriority(
    grant: PreLearningGrant | null | undefined,
    session: { eventId: string; scheduledAt: Date | string },
    now: Date,
): boolean {
    if (!grant || !grant.completedAt) return false
    if (!grantIsLive(grant, now)) return false
    if (grant.eventId === session.eventId) return false
    return time(session.scheduledAt) <= grantExpiresAt(grant).getTime()
}

export interface PreLearningItem {
    type: 'video' | 'file' | 'url'
    label: string
    url: string
}

/** What a J3 lead typed, as a clean list: labelled, linked, and http(s) only. */
export function sanitisePreLearning(raw: unknown): PreLearningItem[] {
    if (!Array.isArray(raw)) return []
    const items: PreLearningItem[] = []
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue
        const { type, label, url } = entry as Record<string, unknown>
        if (typeof label !== 'string' || typeof url !== 'string') continue
        const cleanUrl = url.trim()
        // A site-relative path or a web address. Nothing else is a link a
        // member should be sent to from here.
        if (!/^(https?:\/\/|\/(?!\/))/i.test(cleanUrl)) continue
        if (!label.trim()) continue
        items.push({
            type: type === 'video' || type === 'file' ? type : 'url',
            label: label.trim().slice(0, 120),
            url: cleanUrl.slice(0, 1000),
        })
        if (items.length >= 20) break
    }
    return items
}
