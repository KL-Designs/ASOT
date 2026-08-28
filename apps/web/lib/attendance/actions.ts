/**
 * The wire format for board mutations, shared by the route that validates them
 * and the hook that sends them.
 *
 * It lives here rather than in either of those so the two cannot drift: a
 * route-local type would be invisible to the client, and a client-local one
 * would be unenforced by the server. Both import this.
 */

/** Actions a member may perform on themselves, while RSVP is open. */
export type MemberAction =
    /** Take a specific open position. Binding, first come first served. */
    | { action: 'claim'; slotId: string }
    /** Step out of whatever position you hold, back into the pool. */
    | { action: 'leave' }
    /**
     * Say where you'd like to be without naming a position. A signal for staff
     * and auto-fill, not a claim — you stay in the pool until somebody places
     * you. Both fields null means "anywhere".
     */
    | { action: 'prefer'; preferredSection: string | null; preferredRole: string | null }

/** Actions requiring `attendance.manage`. Not bound by the RSVP window. */
export type StaffAction =
    /** Put anyone in any position, or clear it with a null userId. Swaps. */
    | { action: 'assign'; slotId: string; userId: string | null }
    /** Place the whole pool at once, honouring stated preferences. */
    | { action: 'autofill' }
    /**
     * Author a position the snapshot does not have — an extra medic for a night
     * that needs two, or any position at all for a custom section.
     *
     * Identified by `roleId` rather than a name so the server can re-check the
     * role's category scope. A picker that filters its own dropdown is a
     * convenience, not a rule: without the id there is nothing to check against
     * and a 1-3-only role could be posted straight into 1-1.
     */
    | { action: 'addSlot'; sectionTitle: string; category: string; roleId: string }
    | { action: 'removeSlot'; slotId: string }
    /**
     * Throw the roster away and cut a fresh one from the ORBAT as it stands
     * now. Destructive: every placement made since the last cut is lost.
     *
     * The escape hatch for a roster that no longer matches reality — assigned
     * platoons changed after RSVP opened, or the ORBAT was restructured
     * mid-cycle. It is not a merge: reconciling a live board against a changed
     * ORBAT position-by-position is a different, much subtler operation, and
     * pretending a reset is one would lose placements silently instead of
     * loudly.
     */
    | { action: 'resnapshot' }

export type BoardAction = MemberAction | StaffAction

export const MEMBER_ACTIONS = ['claim', 'leave', 'prefer'] as const

export function isMemberAction(action: BoardAction): action is MemberAction {
    return (MEMBER_ACTIONS as readonly string[]).includes(action.action)
}
