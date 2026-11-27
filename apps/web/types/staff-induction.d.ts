interface StaffInductionRecord {
    _id?: import('mongodb').ObjectId
    userId: string
    userName: string
    /** Department or context this induction is for (e.g. 'j3', 'j4', 'promotion') */
    context: string
    /** Department code that triggered this induction (e.g. 'j3') — used to look up dept-specific content */
    dept?: string
    /** Rank or role the induction was triggered by */
    triggerLabel?: string
    triggeredById: string
    triggeredByName: string
    triggeredAt: Date
    /** Part A: rules acceptance */
    partACompletedAt?: Date
    /** Part B: optional tutorial — null means skipped/not required */
    partBCompletedAt?: Date
    partBSkipped?: boolean
    completedAt?: Date
    notes?: string
}

interface StaffInductionContent {
    _id: string
    rulesTitle: string
    rulesBody: string
    tutorialTitle?: string
    tutorialBody?: string
    updatedAt?: Date
    updatedByName?: string
}

/** Per-department induction content stored in site_settings as 'inductionContent:{dept}' */
interface InductionDeptContent {
    _id: string
    dept: string
    rulesBody: string
    tutorialBody?: string
    updatedAt?: Date
    updatedByName?: string
}
