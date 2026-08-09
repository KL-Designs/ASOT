interface J1Application {
    _id?: import('mongodb').ObjectId
    discordUsername: string
    discordName?: string
    discordId?: string
    inGameName: string
    age: number
    experience: string
    status: 'pending' | 'reviewing' | 'accepted' | 'rejected' | 'returned'
    submittedAt: Date
    submittedIp?: string
    reviewedBy?: string
    reviewedAt?: Date
    notes?: string
    isDirectRecruit?: boolean
    recruiter?: string
    linkedUserId?: string
    linkedUserDisplayName?: string
    // Extended fields
    steamUrl?: string
    steamId64?: string
    region?: string
    currentUnit?: string
    heardAbout?: string
    heardAboutOther?: string
    armaHours?: string
    priorMilsim?: boolean
    dualClan?: boolean
    previousUnits?: string
    availableNights?: string
    opsPerMonth?: string
    primaryRole?: string
    secondaryRole?: string
    additionalRoles?: string[]
    departmentInterest?: string[]
    ownsArma?: boolean
    assignedReviewerId?: string
    assignedReviewerName?: string
    assignedByLeadId?: string
    assignedByLeadName?: string
    recruiterNote?: string
    reviewDueAt?: Date
    overdueReminderSentAt?: Date
    ageExemptionNote?: string
    // Recruiter submits a recommendation; J1 Lead makes the final accept/reject decision
    recruiterRecommendation?: 'approve' | 'deny' | 'pend'
    recruiterRecommendationAt?: string
    // Returning-member check run when a recruiter is assigned
    returningMemberCheck?: {
        status: 'CLEAR' | 'HD' | 'GD' | 'DD' | 'YES' | 'REVIEW' | 'NO' // YES/REVIEW/NO kept for backward compat
        checkedAt: string
        details?: string
    }
    // J4 review (mandatory for DD; optional for GD via notifyJ4GD)
    j4ReviewStatus?: 'pending' | 'approved' | 'rejected'
    j4ReviewTaskId?: string
    j4ReviewedById?: string
    j4ReviewedByName?: string
    j4ReviewNote?: string
    j4GDNotified?: boolean // true when recruiter optionally notified J4 for a GD returning member
}
