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

export interface SimulationInput {
    roster: RosterSlot[]
    /** Members with no position of their own — the real reservist pool. */
    reservists: string[]
    rand: () => number
}

export interface SimulationResult {
    roster: RosterSlot[]
    rsvp: Record<string, 'attending' | 'not_attending'>
    preferences: Record<string, { section: string | null; role: string | null }>
}

/**
 * Roughly what a real operation looks like the day before it runs. Tuned so a
 * generated board shows every state at once rather than a realistic-but-boring
 * one where almost everybody simply said yes.
 */
const P_HOLDER_ATTENDS = 0.6
const P_HOLDER_DECLINES = 0.18
// The remainder never answer, which is what makes "awaiting" the largest group
// on a real board — and the reason positions stay reserved until RSVP closes.

/** Of those attending, how many turn out for a different section instead. */
const P_HOLDER_GOES_RESSY = 0.12

const P_RESERVIST_ATTENDS = 0.75
/** Of reservists attending, how many grab a position rather than wait. */
const P_RESERVIST_CLAIMS = 0.55
/** Of those waiting, how many say where they would like to be. */
const P_RESERVIST_HAS_PREFERENCE = 0.6

function pick<T>(items: T[], rand: () => number): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(rand() * items.length)]
}

export function simulateAttendance({ roster, reservists, rand }: SimulationInput): SimulationResult {
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

        if (roll < P_HOLDER_DECLINES) {
            rsvp[userId] = 'not_attending'
            // Cleared rather than left to the derivation: this roster is
            // written to the database, and a stored occupant who has declined
            // is a contradiction sitting in the document.
            if (home) next = assignSlot(next, home.id, null)
            continue
        }

        // Never answered: they stay pencilled in, which is what "awaiting" is.
        if (roll >= P_HOLDER_DECLINES + P_HOLDER_ATTENDS) continue

        rsvp[userId] = 'attending'

        // Some turn out somewhere else, which is what leaves their own position
        // showing as released and puts them in another section as a backfill.
        if (home && rand() < P_HOLDER_GOES_RESSY) {
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
        if (rand() >= P_RESERVIST_ATTENDS) {
            rsvp[userId] = 'not_attending'
            continue
        }
        rsvp[userId] = 'attending'

        if (rand() < P_RESERVIST_CLAIMS) {
            const target = pick(freeSlots(), rand)
            if (target) { next = assignSlot(next, target.id, userId); continue }
        }

        // Waiting in the pool. Some name a section or a role, some will take
        // anything — the board needs both to be worth looking at.
        if (rand() < P_RESERVIST_HAS_PREFERENCE) {
            preferences[userId] = rand() < 0.5
                ? { section: pick(sections, rand) ?? null, role: null }
                : { section: null, role: pick(roles, rand) ?? null }
        } else {
            preferences[userId] = { section: null, role: null }
        }
    }

    return { roster: next, rsvp, preferences }
}
