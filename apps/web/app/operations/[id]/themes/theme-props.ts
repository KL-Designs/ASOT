/**
 * What every theme's page component is handed.
 *
 * `page.tsx` does all the fetching and every permission check, then dispatches
 * on `pageTheme`. The themes are pure renderers: no `await`, no `Db`, no
 * `fetchMe`. That keeps the gates in one file — three copies of a three-armed
 * permission check drifting apart is a bug nobody notices until somebody sees
 * something they shouldn't.
 */
import type { TabAccess } from '../tabs'

export interface ThemePageProps {
    id: string
    operation: Operation
    me: User | null
    isLoggedIn: boolean
    /**
     * `operations.orders.view` — may open the orders editor. Drives the Edit
     * button and the Orders tab's Read/Edit menu.
     *
     * Named `isHQ` from when the whole area hung off one Discord role. It is a
     * capability now; the name survives because four theme files read it and
     * renaming it would be a much larger diff than the change that earned it.
     */
    isHQ: boolean
    /** `operations.ocap.manage` — may link and re-sync the replay. */
    canOcapManage: boolean
    /**
     * Which tabs this viewer gets, one capability each. Resolved server-side in
     * `page.tsx` and handed to `OperationBar`, so the strip never offers a tab
     * whose page would redirect the viewer straight back.
     */
    access: TabAccess
    /** `attendance.confirm` — everyone who takes a roll call. */
    isAllStaff: boolean
    canManageAttendance: boolean
    /**
     * `operations.zeus` — may read and write Zeus Notes pages. Not "is on J6":
     * the pages are gated on the permission, and the role array is only the
     * legacy arm of that check.
     */
    canZeus: boolean
    isSectionLeader: boolean
    showAcknowledgeCard: boolean
    /** `?page=` — which document (or the Zeus / OCAP pseudo-pages) is open. */
    activePageParam?: string
    /** Came in from the J2 operations tab; the back link should go back there. */
    fromJ2: boolean
}

/**
 * What the orders page knows about attendance without loading the board.
 *
 * Read on the server in one projected query, because the Modern theme puts the
 * answer in its header rather than in a panel — and a header that arrives a
 * second late, after a client fetch, is worse than one that says nothing. The
 * board itself still owns the live picture; this is only enough to tell a
 * member what they owe.
 */
export interface OrdersAttendance {
    /** Null when RSVP has never opened — there is no roster to count yet. */
    rsvpOpen: boolean
    attending: number
    /** Positions cut from the ORBAT when RSVP opened. 0 before that. */
    seats: number
    filled: number
    /** This viewer's own answer, if they are signed in and have given one. */
    myRsvp: 'attending' | 'not_attending' | null
    /** The position they hold, if any — the role name as the board shows it. */
    myPosition: string | null
}

/**
 * Where the operation sits in its campaign.
 *
 * Null for a standalone operation, and null rather than partial if the campaign
 * itself has gone — a mission number with no campaign to number it against is
 * worse than saying nothing.
 */
export interface OrdersLineage {
    campaign: string
    /** The mission's position in the campaign, when it is linked to one. */
    sequence: number | null
}

export interface ModernPageProps extends ThemePageProps {
    attendance: OrdersAttendance
    lineage: OrdersLineage | null
}
