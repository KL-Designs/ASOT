import { ObjectId } from 'mongodb'

export { }

declare global {

    type CommunityTicketCategory =
        | 'request'
        | 'bug'
        | 'mission'
        | 'campaign'
        | 'unit-feedback'
        | 'complaint'
        | 'award'

    type CommunityTicketSubtype =
        | 'mod-request'
        | 'feature-request'
        | 'bug-arma'
        | 'bug-discord'
        | 'bug-website'
        | 'bug-milpack'
        | 'bug-teamspeak'
        | 'bug-other-game'
        | 'bug-other'
        | 'mission'
        | 'campaign'
        | 'unit-feedback'
        | 'complaint-individual'
        | 'complaint-group'
        | 'complaint-department'
        | 'award-nomination'
        | 'award-creation'

    type CommunityTicketStatus =
        | 'open'
        | 'in_review'
        | 'implementing'
        | 'implemented'
        | 'broken_mod'
        | 'resolved'
        | 'denied'
        | 'no_action_required'
        | 'closed'

    type CommunityTicketVisibility = 'public' | 'private'

    interface CommunityTicket {
        _id: ObjectId
        category: CommunityTicketCategory
        subtype: CommunityTicketSubtype
        visibility: CommunityTicketVisibility
        status: CommunityTicketStatus
        title: string
        description: string
        authorId: string
        authorName: string
        authorAvatarId?: string
        isAnonymous: boolean
        createdAt: Date
        updatedAt: Date
        isDeleted: boolean
        deletedAt?: Date
        deletedById?: string
        deletedByName?: string

        upvotes: string[]
        downvotes: string[]
        voteScore: number
        commentCount: number

        /**
         * Multi-status support. When present, this is the authoritative list.
         * The legacy `status` field is kept as the primary for backwards compat.
         */
        statuses?: CommunityTicketStatus[]

        /** Multi-select sub-status tags (Implementing, Implemented, Broken, Resolved, Denied, No Action Required) */
        ticketTags?: string[]

        /** Primary routing dept (kept for backward compat); full list in departments[] */
        department: string
        /** Multi-dept assignment (J4 can assign multiple) */
        departments: string[]

        /** Discord forum-style tags */
        tags: string[]

        // ── Request fields ──────────────────────────────────────────────────────
        modLink?: string
        game?: string
        gameOther?: string
        featureCategory?: string
        featureCategoryOther?: string
        responsibleDept?: string
        weblink?: string
        justification?: string

        // ── Bug fields ──────────────────────────────────────────────────────────
        stepsToReproduce?: string
        expectedResult?: string
        actualResult?: string
        severity?: 'low' | 'medium' | 'high' | 'critical'
        /** For Discord: array of issue types selected */
        discordIssueTypes?: string[]
        discordIssueDetail?: string
        /** For Website/MILPAC: the URL */
        bugUrl?: string
        /** For TeamSpeak: selected issue type */
        tsBugType?: string
        /** Fallback platform detail string */
        bugPlatformDetail?: string

        // ── Mission/Campaign fields ─────────────────────────────────────────────
        missionType?: 'midweek' | 'weekend'
        missionForces?: string
        missionEnemyForces?: string
        missionFriendlyForces?: string
        missionIndependentForces?: string
        missionCivilianPopulace?: string
        missionObjectives?: string
        missionStory?: string
        missionPlayerExperience?: string
        missionMechanics?: string
        missionAdditionalNotes?: string
        campaignPhases?: CampaignPhase[]

        // ── Unit Feedback fields (private) ──────────────────────────────────────
        feedbackCategories?: string[]
        feedbackCategoryOther?: string
        feedbackType?: 'positive' | 'neutral' | 'negative'

        // ── Complaint fields (private) ──────────────────────────────────────────
        complainantName?: string
        complainantAnonymous?: boolean
        membersInvolved?: string[]
        membersInvolvedNotListed?: string
        isStaffComplaint?: boolean
        desiredOutcome?: string
        evidenceAcknowledged?: boolean

        // ── Award fields (private) ──────────────────────────────────────────────
        nomineeName?: string
        nomineeRank?: string
        nominatorName?: string
        supportingMembers?: string[]
        awardType?: string
        awardCategory?: string
        awardCategoryOther?: string
        awardRequirements?: string
        awardDesignRef?: string
        awardDesignNotes?: string

        attachments: string[]
        mediaLinks?: string[]
        otherComments?: string

        /** When false, dept members cannot see this ticket — only dept leads + J4 */
        memberVisible?: boolean

        tasks?: CommunityTicketTask[]

        activityLog: CommunityTicketActivity[]
    }

    interface CommunityTicketTask {
        id: string
        title: string
        description?: string
        assignedToUserId?: string
        assignedToUserName?: string
        assignedToRole?: string
        dueAt?: Date
        chaseUpAt?: Date
        status: 'pending' | 'completed'
        completedAt?: Date
        completedByName?: string
        createdAt: Date
        createdByName: string
    }

    interface CampaignPhase {
        title: string
        description: string
    }

    interface CommunityTicketComment {
        _id: ObjectId
        ticketId: ObjectId
        authorId: string
        authorName: string
        authorAvatarId?: string
        content: string
        createdAt: Date
        updatedAt?: Date
        isEdited: boolean
        isDeleted: boolean
        upvotes: string[]
        downvotes: string[]
        voteScore: number
    }

    interface CommunityTicketActivity {
        action:
            | 'created'
            | 'edited'
            | 'deleted'
            | 'restored'
            | 'status_changed'
            | 'reassigned'
            | 'tagged'
            | 'comment_added'
            | 'comment_edited'
            | 'comment_deleted'
            | 'transferred'
            | 'reopened'
        actorId: string
        actorName: string
        timestamp: Date
        oldValue?: string
        newValue?: string
        /** For comment-related activities: links to the comment */
        commentId?: string
        /** Stores previous content for edit diffs */
        prevContent?: string
    }

}
