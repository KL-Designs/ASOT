/**
 * The slot model behind the live attendance board.
 *
 * An operation's attendance used to be a flat list of people, each carrying a
 * copy of their ORBAT role, with "who is in what position" left to inference.
 * That inference is why the old system could not express a reserved position,
 * a released one, or an empty one — all three look identical when all you have
 * is a list of attendees.
 *
 * So a slot is a real thing here, and it carries two user references that must
 * never be conflated:
 *
 * - `homeUserId` — whose position this is in the ORBAT. Written once, at
 *   snapshot, and never again. This is the field the old code destroyed: the
 *   RSVP route overwrote a member's `orbatRole` in place when they joined
 *   another section, so nothing remembered where they came from.
 * - `occupantUserId` — who is actually playing in it for this operation.
 *   Everything the board does writes this and only this.
 *
 * Pure throughout. The stage and the RSVP answers are passed in rather than
 * read, the same way `lib/operations/phases.ts` takes its clock.
 */

/** An ORBAT position as it stands at the moment the snapshot is taken. */
export interface OrbatSnapshotPosition {
    category: string
    sectionTitle: string
    role: string
    userId: string | null
    sectionOrder: number
    positionOrder: number
}

export interface RosterSlot {
    id: string
    category: string
    sectionTitle: string
    role: string
    order: number
    /** ORBAT holder at snapshot time. null = the position was vacant. */
    homeUserId: string | null
    /** Who is playing in it. Cleared by a decline or a move elsewhere. */
    occupantUserId: string | null
}

/**
 * Take the snapshot. Called once, when RSVP opens.
 *
 * The holder of a position starts out in their own slot — pencilled in, not
 * confirmed. That is what makes a slot "reserved": the member is already in it
 * and nobody else can be, until they answer or the window closes.
 *
 * Slot ids are derived from the position's coordinates rather than generated,
 * so they are stable across a re-snapshot and legible in a Mongo document. A
 * category, a section's order, and a position's order within it identify a
 * position uniquely, so the three together cannot collide.
 */
export function buildRoster(positions: OrbatSnapshotPosition[]): RosterSlot[] {
    return positions.map(p => ({
        id: `${p.category}-${p.sectionOrder}-${p.positionOrder}`,
        category: p.category,
        sectionTitle: p.sectionTitle,
        role: p.role,
        order: p.positionOrder,
        homeUserId: p.userId,
        occupantUserId: p.userId,
    }))
}

/**
 * What a slot is doing, in the order the board cares about.
 *
 * `declined` and `released` both leave an empty slot, and it is tempting to
 * collapse them into `open`. They stay distinct because they mean opposite
 * things to a section leader chasing people up: one member is not turning up
 * at all, the other is turning up in somebody else's section. That difference
 * is the only information which says which problem you have.
 *
 * `lapsed` is `awaiting` after the RSVP window shuts — the member never
 * answered, so the position is now fair game. It is derived from the stage
 * rather than written by a job, which is why nothing has to run at RSVP close
 * and there is no risk of a release running twice.
 */
export type SlotState =
    | 'held'        // its own member, attending
    | 'awaiting'    // its own member, no answer yet — reserved for them
    | 'lapsed'      // its own member, no answer, window shut
    | 'backfilled'  // somebody from outside the section
    | 'open'        // vacant in the ORBAT, unclaimed
    | 'declined'    // its member answered no
    | 'released'    // its member is playing elsewhere

export interface RosterContext {
    /** userId → their answer. Absent or null means they have not replied. */
    rsvp: Record<string, 'attending' | 'not_attending' | null>
    /** Past the RSVP window: unanswered positions stop being reserved. */
    rsvpClosed: boolean
}

export interface SlotView extends RosterSlot {
    state: SlotState
    /** Whose position it is, when they are not in it. Drives "Declined · Okafor". */
    vacatedBy: string | null
    /** Whether somebody can be put in it. `awaiting` is the interesting false. */
    available: boolean
}

/** States in which the slot has nobody in it and will accept somebody. */
const AVAILABLE = new Set<SlotState>(['open', 'declined', 'released', 'lapsed'])

/**
 * Derive every slot's state in one pass.
 *
 * Takes the whole roster rather than one slot because `released` is a
 * cross-slot question — a position is released precisely when its own member
 * turns up in a different one — and answering that per slot would rescan the
 * roster for each of ~70 positions on every render.
 */
export function viewRoster(roster: RosterSlot[], ctx: RosterContext): SlotView[] {
    const answered = (userId: string | null) => (userId ? ctx.rsvp[userId] ?? null : null)

    // Where each member actually is, so a home member sitting in someone
    // else's slot can be recognised from their own slot.
    const slotByOccupant = new Map<string, RosterSlot>()
    for (const slot of roster) {
        if (slot.occupantUserId && answered(slot.occupantUserId) !== 'not_attending') {
            slotByOccupant.set(slot.occupantUserId, slot)
        }
    }

    return roster.map(slot => {
        // A member who answered no is not in the slot, whatever the stored
        // occupant says. Deriving rather than trusting keeps a missed write
        // from leaving someone visibly holding a position they declined.
        const occupant = answered(slot.occupantUserId) === 'not_attending' ? null : slot.occupantUserId

        let state: SlotState
        let vacatedBy: string | null = null

        if (occupant) {
            if (occupant === slot.homeUserId) {
                state = answered(occupant) === 'attending'
                    ? 'held'
                    : ctx.rsvpClosed ? 'lapsed' : 'awaiting'
            } else {
                state = 'backfilled'
            }
        } else if (!slot.homeUserId) {
            state = 'open'
        } else {
            vacatedBy = slot.homeUserId
            const elsewhere = slotByOccupant.get(slot.homeUserId)
            if (answered(slot.homeUserId) === 'not_attending') state = 'declined'
            else if (elsewhere && elsewhere.id !== slot.id) state = 'released'
            else if (ctx.rsvpClosed) state = 'lapsed'
            else state = 'open'
        }

        return { ...slot, state, vacatedBy, available: AVAILABLE.has(state) }
    })
}

/**
 * Put a member in a slot, and keep the roster consistent while doing it.
 *
 * Three rules fall out of a member being able to occupy exactly one position:
 *
 * 1. Whatever slot they were in empties.
 * 2. If the destination was occupied, the two **swap**. Refusing the drop
 *    instead would only make staff perform the same move in two steps with
 *    somebody parked nowhere in between — a worse version of what they meant.
 * 3. When the mover came from the pool there is nowhere to swap into, so the
 *    displaced member goes back to the pool.
 *
 * Returns a new array; the input is never touched. The board renders straight
 * off this, so an in-place edit would mutate React state behind its back.
 */
export function assignSlot(
    roster: RosterSlot[],
    slotId: string,
    userId: string | null,
): RosterSlot[] {
    const target = roster.find(s => s.id === slotId)
    if (!target) return roster

    const displaced = target.occupantUserId
    if (displaced === userId) return roster

    // Where the mover is coming from — the seat the displaced member inherits.
    const vacated = userId ? roster.find(s => s.occupantUserId === userId) : undefined

    return roster.map(slot => {
        if (slot.id === slotId) return { ...slot, occupantUserId: userId }
        if (vacated && slot.id === vacated.id) return { ...slot, occupantUserId: displaced }
        return slot
    })
}

/** A member available to play who is not (yet) in a position. */
export interface PoolMember {
    userId: string
    /** "I'd like to be in Bravo" — a signal, not a claim. */
    preferredSection: string | null
    /** "I'd like to be a medic, anywhere." */
    preferredRole: string | null
}

export interface PoolEntry extends PoolMember {
    /** The home position they gave up to be here, if they have one. */
    releasedSlotId: string | null
}

/**
 * Who is waiting to be placed.
 *
 * The caller decides who is eligible — that depends on RSVP answers and ORBAT
 * reservist categories, neither of which belongs in a pure model. This only
 * answers "of those people, who has nowhere to stand", and points at the
 * position each of them vacated to get here.
 *
 * That last part is the dual-identity case: a section commander in Alpha who
 * has put themselves up for Bravo is one member with a home position they are
 * not in. The pool card names it, because their absence is why Alpha is short.
 */
export function derivePool(roster: RosterSlot[], members: PoolMember[]): PoolEntry[] {
    const placed = new Set(roster.map(s => s.occupantUserId).filter(Boolean) as string[])
    const homeSlot = new Map<string, string>()
    for (const slot of roster) {
        if (slot.homeUserId && slot.occupantUserId !== slot.homeUserId) homeSlot.set(slot.homeUserId, slot.id)
    }

    return members
        .filter(m => !placed.has(m.userId))
        .map(m => ({ ...m, releasedSlotId: homeSlot.get(m.userId) ?? null }))
}

export interface AutoFillResult {
    roster: RosterSlot[]
    placed: { userId: string; slotId: string }[]
    unplaced: string[]
}

/** How specific a member's preference is — the pickiest are served first. */
function specificity(m: PoolMember): number {
    if (m.preferredSection && m.preferredRole) return 0
    if (m.preferredRole) return 1
    if (m.preferredSection) return 2
    return 3
}

/**
 * Place the pool into what is free, honouring preferences.
 *
 * Members are served most-specific-first, which is the whole reason the order
 * is deliberate rather than incidental: place the member who will take
 * anything first and they take the one medic slot, leaving the member who
 * actually asked to be a medic with nothing. Within a tier the caller's order
 * is preserved, so the result is deterministic and the whole thing undoes as
 * one action.
 *
 * A preference is a wish, not a filter. Somebody who asked for a section that
 * is already full still gets a position — being placed somewhere beats being
 * left out of the operation.
 */
export function autoFill(
    roster: RosterSlot[],
    pool: PoolMember[],
    ctx: RosterContext,
): AutoFillResult {
    const free = new Set(viewRoster(roster, ctx).filter(v => v.available).map(v => v.id))

    let next = roster
    const placed: { userId: string; slotId: string }[] = []
    const unplaced: string[] = []

    const order = pool
        .map((m, i) => ({ m, i }))
        .sort((a, b) => specificity(a.m) - specificity(b.m) || a.i - b.i)
        .map(x => x.m)

    for (const m of order) {
        const candidates = next.filter(s => free.has(s.id))
        const pick =
            candidates.find(s => (!m.preferredSection || s.sectionTitle === m.preferredSection)
                && (!m.preferredRole || s.role === m.preferredRole))
            ?? candidates.find(s => m.preferredRole && s.role === m.preferredRole)
            ?? candidates.find(s => m.preferredSection && s.sectionTitle === m.preferredSection)
            ?? candidates[0]

        if (!pick) { unplaced.push(m.userId); continue }
        free.delete(pick.id)
        next = assignSlot(next, pick.id, m.userId)
        placed.push({ userId: m.userId, slotId: pick.id })
    }

    return { roster: next, placed, unplaced }
}
