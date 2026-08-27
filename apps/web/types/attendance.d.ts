import type { ObjectId } from 'mongodb'

export { }

declare global {

    interface OperationAttendanceRecord {
        userId: string              // Discord ID or skeleton account ID
        unit: string                // e.g. '1-1 Alpha'
        orbatSection: string        // section title from ORBAT (e.g. '1-1 Alpha Section')
        orbatRole: string           // position/role in ORBAT
        rsvp: 'attending' | 'not_attending' | null  // member self-report before op
        confirmed: boolean          // section leader confirmed actual attendance
        confirmedBy: string | null  // userId of confirming section leader
        confirmedAt: Date | null
        importedStatus?: string     // 'ATTENDED' | 'NOT ATTENDING' | 'RESOLVED' | 'LOA' (from CSV)
        attendanceType?: string     // Visual flag: 'ATTENDED' | 'NOT ATTENDING' | 'RESOLVED' | 'NO NOTICE' | 'LOA' | 'CONFIRM' | 'N/A' | 'ADDED TO UNIT'
        reservistSection?: string   // if set, member is attending as a reservist in this section instead of their own
    }

    interface OperationAttendance {
        _id: ObjectId
        operationId: ObjectId
        assignedPlatoons: string[]  // e.g. ['platoon11', 'platoon12', 'support']
        records: OperationAttendanceRecord[]
        reservistAssignments: {     // reservists temporarily assigned to a section for this op
            userId: string
            sectionTitle: string
        }[]
        rsvpOpen: boolean           // whether members can still RSVP
        /**
         * When to auto-open RSVP. Derived, not authored: the server recomputes
         * it from `rsvpOpenOffsetMins` whenever that offset or the operation
         * date changes. Kept as a stored instant so the cron can keep using an
         * indexed date query, and so the public NextOpCard and live-status can
         * read it without knowing the op date.
         * Undefined = no automatic open.
         */
        rsvpOpenAt?: Date
        /**
         * Source of truth for the open end: minutes before op start, mirroring
         * `rsvpCloseOffsetMins`. Stored as an offset so the window follows the
         * operation if its date moves — an absolute instant did not, which is
         * how an operation ended up opening RSVP weeks after it had run.
         * Undefined = no automatic open (RSVP opens only via the stage).
         */
        rsvpOpenOffsetMins?: number
        rsvpCloseOffsetMins?: number // mins before op start to auto-close RSVP (default: 60)
        confirmationOpen: boolean   // whether section leaders can still confirm
        confirmationOpenedAt?: Date // when confirmation was last opened (for 24h auto-close)
        stage?: 'preparing' | 'rsvp_open' | 'rsvp_closed' | 'op_running' | 'confirmations_open' | 'completed'

        chqAllocationReminderSentAt?: Date  // set when the 1hr-before CHQ reminder fires (prevents re-send)

        // Lead Zeus nomination — CHQ picks one Zeus for the night
        leadZeus?: string       // Discord user ID of nominated Lead Zeus
        leadZeusName?: string   // Display name at time of nomination

        // Custom attendance units — non-ORBAT groups defined manually by HQ
        customUnits?: Array<{
            id: string
            name: string
            color?: string
        }>
    }

    /** Shape returned by the attendance GET endpoint with user details populated */
    interface OperationAttendanceWithUsers extends OperationAttendance {
        recordsWithUsers: (OperationAttendanceRecord & {
            category?: string
            user: {
                id: string
                displayName: string
                avatarURL: string
                isSkeletonAccount?: boolean
                csvName?: string
            } | null
        })[]
        sectionMeta?: Array<{ category: string; sectionTitle: string | null; color?: string }>
    }

}
