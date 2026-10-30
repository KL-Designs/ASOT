import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * One candidate's NCO assessment on one mission night. The flow and who may
     * take each step are in lib/training/nco-assessment.ts.
     */
    interface NcoAssessment {
        _id: ObjectId
        operationId: ObjectId
        /** Copied at request time, so the list reads without a join. */
        operationTitle: string
        operationDate: Date

        candidateId: string
        candidateName: string
        /** The candidate's section when they asked — whose staff approve a shadow. */
        candidateSection?: string | null
        /** What the candidate wants assessed, in their own words. */
        notes?: string

        status: 'requested' | 'assigned' | 'confirmed' | 'completed' | 'cancelled'

        assessorId?: string | null
        assessorName?: string | null
        assignedById?: string
        assignedByName?: string
        assignedAt?: Date
        /** When the assessor marked themselves as assigned. */
        confirmedAt?: Date

        /** Absent until the assessor asks to shadow the section. */
        shadow?: {
            status: 'requested' | 'approved' | 'declined'
            requestedAt: Date
            decidedById?: string
            decidedByName?: string
            decidedAt?: Date
        } | null

        /** Link to the NCO assessment sheet for this night. */
        sheetUrl?: string | null
        assessorNotes?: string
        outcome?: 'pass' | 'not_yet' | 'reassess' | null
        /** Link to a recording of the night. */
        recordingUrl?: string | null

        completedAt?: Date
        cancelledAt?: Date
        cancelledByName?: string

        createdAt: Date
        updatedAt: Date
    }

}
