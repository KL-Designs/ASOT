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
        confirmationOpen: boolean   // whether section leaders can still confirm
    }

    /** Shape returned by the attendance GET endpoint with user details populated */
    interface OperationAttendanceWithUsers extends OperationAttendance {
        recordsWithUsers: (OperationAttendanceRecord & {
            user: {
                id: string
                displayName: string
                avatarURL: string
                isSkeletonAccount?: boolean
                csvName?: string
            } | null
        })[]
    }

}
