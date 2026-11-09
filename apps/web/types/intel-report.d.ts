import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * Rows 331 and 332: one piece of intelligence in a campaign's Intelligence
     * Report. Collection `intel_entries`.
     *
     * One record that every later mission in the campaign reads, never a copy
     * per operation, so an assessment or an edit shows everywhere at once.
     * Whether it carries forward depends only on its release and the
     * campaign's settings, never on its assessment: declined intel is still
     * intel the players were given.
     */
    interface IntelEntry {
        _id?: ObjectId
        /** The campaign it belongs to; null for a standalone operation. */
        campaignId: string | null
        /** The operation it was reported on; null for a campaign's starting intel. */
        operationId: string | null
        /** Mission sequence it was reported in. 0 is starting intel. */
        sourceSequence: number
        /** Set when it was written from an AAR's Intelligence block. */
        sourceAarUserId?: string | null
        /** The reporting call sign, or "Starting intel" / "Staff". */
        callSign: string
        submittedById: string
        submittedByName: string
        title: string
        description: string
        evidence: IntelEvidence[]
        /** Free-text grid reference, as players write it ("034 127"). */
        grid: string
        /** Null when released; otherwise the mission sequence it is hidden until. */
        hiddenUntilSequence: number | null
        /** Held back from players by hand until a mission maker shows it, whatever the mission. */
        hidden?: boolean
        /** 'pending' only while the campaign asks for approval before publication. */
        publication: 'published' | 'pending'
        assessment: IntelAssessment
        versions: IntelVersion[]
        deletedAt?: Date | null
        deletedById?: string | null
        deletedByName?: string | null
        deleteReason?: string | null
        createdAt: Date
        updatedAt: Date
    }

    type IntelEvidenceKind = 'image' | 'video' | 'link'

    interface IntelEvidence {
        kind: IntelEvidenceKind
        url: string
        caption: string
    }

    type IntelAssessmentStatus = 'confirmed' | 'partial' | 'declined' | 'unassessed'

    interface IntelAssessment {
        status: IntelAssessmentStatus
        comment: string
        /** Withheld from players until set. */
        released: boolean
        byId?: string | null
        byName?: string | null
        at?: Date | null
    }

    /** What an entry said before an edit. */
    interface IntelVersion {
        at: Date
        byId: string
        byName: string
        title: string
        description: string
        evidence: IntelEvidence[]
        grid: string
    }

    /** One member's thumbs up or down. Unique on (entryId, userId). Collection `intel_votes`. */
    interface IntelVote {
        _id?: ObjectId
        entryId: ObjectId
        userId: string
        value: 1 | -1
        at: Date
    }

    /** A staff comment on an entry. Collection `intel_comments`. */
    interface IntelComment {
        _id?: ObjectId
        entryId: ObjectId
        authorId: string
        authorName: string
        body: string
        createdAt: Date
        deletedAt?: Date | null
    }

    /** Per campaign (or per standalone operation) Intelligence Report settings. */
    interface IntelReportSettings {
        /** Players can read the report. Off keeps it to staff. */
        sharing: boolean
        /** Earlier missions' intel shows on later missions. */
        carryForward: boolean
        /** Staff AARs carry an Intelligence block. */
        importFromAars: boolean
        /** New entries wait for an assessor before players see them. */
        requireApproval: boolean
    }
}
