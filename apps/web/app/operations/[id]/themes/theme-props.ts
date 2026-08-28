/**
 * What every theme's page component is handed.
 *
 * `page.tsx` does all the fetching and every permission check, then dispatches
 * on `pageTheme`. The themes are pure renderers: no `await`, no `Db`, no
 * `fetchMe`. That keeps the gates in one file — three copies of a three-armed
 * permission check drifting apart is a bug nobody notices until somebody sees
 * something they shouldn't.
 */
export interface ThemePageProps {
    id: string
    operation: Operation
    me: User | null
    isLoggedIn: boolean
    /** `pages.operationsEdit` — staff who own the operation. */
    isHQ: boolean
    /** `attendance.confirm` — everyone who takes a roll call. */
    isAllStaff: boolean
    canManageAttendance: boolean
    isJ6: boolean
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

export interface ModernPageProps extends ThemePageProps {
    attendance: OrdersAttendance
}
