import { assignSlot, viewRoster, type RosterSlot } from './roster'

/**
 * A development tool: fill an operation's board with plausible attendance so
 * every state the board can draw is actually on screen.
 *
 * It writes to a real roster, so it holds to the same invariants the board
 * depends on — a member occupies at most one position, and nobody who declined
 * is left standing in one. A generator that quietly broke those would produce a
 * board that cannot happen, which is worse than an empty one for judging how
 * the real thing looks.
 *
 * Pure and seeded. Determinism is what makes it testable, and it also means
 * "that looked wrong, show me again" reproduces rather than reshuffles.
 */

/** Small, fast, seeded PRNG. Deterministic across runs and platforms. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** How well a given night turns out. */
export interface TurnoutProfile {
    holderAttends: number
    holderDeclines: number
    /** Of the holders attending, how many turn out for a different section. */
    holderGoesReservist: number
    reservistAttends: number
    /** Of reservists attending, how many grab a position rather than wait. */
    reservistClaims: number
    /** Of those waiting, how many say where they would like to be. */
    reservistHasPreference: number
}

export type TurnoutKey = 'quiet' | 'medium' | 'busy'

/**
 * Three nights worth generating.
 *
 * One set of numbers only ever showed one board. What the board has to survive
 * is the two ends: a quiet night is mostly gaps and a nearly empty pool, which
 * is when "who is missing" has to be readable at a glance; a busy night fills
 * almost every position and leaves a pool longer than the rail, which is when
 * the layout is under pressure. The middle is an ordinary Saturday.
 *
 * Whatever is left after attending and declining never answers at all, which is
 * the largest group on a real board and the reason positions stay reserved
 * until RSVP closes — so `holderAttends + holderDeclines` is deliberately well
 * under 1 in every profile.
 */
export const TURNOUT_PROFILES: Record<TurnoutKey, TurnoutProfile> = {
    quiet: {
        holderAttends: 0.34,
        holderDeclines: 0.34,
        holderGoesReservist: 0.08,
        reservistAttends: 0.35,
        reservistClaims: 0.45,
        reservistHasPreference: 0.5,
    },
    medium: {
        holderAttends: 0.6,
        holderDeclines: 0.18,
        holderGoesReservist: 0.12,
        reservistAttends: 0.75,
        reservistClaims: 0.55,
        reservistHasPreference: 0.6,
    },
    busy: {
        holderAttends: 0.82,
        holderDeclines: 0.06,
        holderGoesReservist: 0.16,
        reservistAttends: 0.92,
        reservistClaims: 0.7,
        reservistHasPreference: 0.65,
    },
}

export const TURNOUT_KEYS = Object.keys(TURNOUT_PROFILES) as TurnoutKey[]

export function isTurnoutKey(value: unknown): value is TurnoutKey {
    return typeof value === 'string' && (TURNOUT_KEYS as string[]).includes(value)
}

export interface SimulationInput {
    roster: RosterSlot[]
    /** Members with no position of their own — the real reservist pool. */
    reservists: string[]
    rand: () => number
    /** Defaults to an ordinary night. */
    turnout?: TurnoutKey
}

export interface SimulationResult {
    roster: RosterSlot[]
    rsvp: Record<string, 'attending' | 'not_attending'>
    preferences: Record<string, { section: string | null; role: string | null }>
}

function pick<T>(items: T[], rand: () => number): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(rand() * items.length)]
}

export function simulateAttendance(
    { roster, reservists, rand, turnout = 'medium' }: SimulationInput,
): SimulationResult {
    const odds = TURNOUT_PROFILES[turnout]
    const rsvp: SimulationResult['rsvp'] = {}
    const preferences: SimulationResult['preferences'] = {}

    // Start from the state a fresh snapshot leaves behind: every holder
    // pencilled into their own position. Clearing the board first looked
    // equivalent and was not — a holder who never answers is *reserved*, not
    // open, and that is the largest group on a real board. Starting empty made
    // "awaiting" impossible to generate, which is the one state anybody
    // generating data most needs to look at.
    let next: RosterSlot[] = roster.map(s => ({ ...s, occupantUserId: s.homeUserId }))

    const sections = [...new Set(roster.map(s => s.sectionTitle))]
    const roles = [...new Set(roster.map(s => s.role))]

    // ── The people who hold a position ────────────────────────────────────────

    const holders = [...new Set(roster.map(s => s.homeUserId).filter(Boolean) as string[])]
    const wanderers: string[] = []

    for (const userId of holders) {
        const home = next.find(s => s.homeUserId === userId)
        const roll = rand()

        if (roll < odds.holderDeclines) {
            rsvp[userId] = 'not_attending'
            // Cleared rather than left to the derivation: this roster is
            // written to the database, and a stored occupant who has declined
            // is a contradiction sitting in the document.
            if (home) next = assignSlot(next, home.id, null)
            continue
        }

        // Never answered: they stay pencilled in, which is what "awaiting" is.
        if (roll >= odds.holderDeclines + odds.holderAttends) continue

        rsvp[userId] = 'attending'

        // Some turn out somewhere else, which is what leaves their own position
        // showing as released and puts them in another section as a backfill.
        if (home && rand() < odds.holderGoesReservist) {
            next = assignSlot(next, home.id, null)
            wanderers.push(userId)
        }
    }

    // ── Placing everyone who is not in their own position ─────────────────────
    //
    // Done after the holders so a wanderer can only land somewhere genuinely
    // free, and the pass reads the live board each time rather than a snapshot,
    // so two people can never be handed the same position.

    const freeSlots = (exclude?: string) =>
        viewRoster(next, { rsvp, rsvpClosed: false })
            .filter(v => v.available && v.homeUserId !== exclude)

    for (const userId of wanderers) {
        const target = pick(freeSlots(userId), rand)
        if (target) next = assignSlot(next, target.id, userId)
        else preferences[userId] = { section: pick(sections, rand) ?? null, role: null }
    }

    for (const userId of reservists) {
        if (rand() >= odds.reservistAttends) {
            rsvp[userId] = 'not_attending'
            continue
        }
        rsvp[userId] = 'attending'

        if (rand() < odds.reservistClaims) {
            const target = pick(freeSlots(), rand)
            if (target) { next = assignSlot(next, target.id, userId); continue }
        }

        // Waiting in the pool. Some name a section or a role, some will take
        // anything — the board needs both to be worth looking at.
        if (rand() < odds.reservistHasPreference) {
            preferences[userId] = rand() < 0.5
                ? { section: pick(sections, rand) ?? null, role: null }
                : { section: null, role: pick(roles, rand) ?? null }
        } else {
            preferences[userId] = { section: null, role: null }
        }
    }

    return { roster: next, rsvp, preferences }
}
