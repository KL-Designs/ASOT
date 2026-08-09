type CandidateStatus = 'active' | 'withdrawn' | 'removed' | 'passed' | 'failed'
type StaffRole = 'lead_instructor' | 'instructor' | 'observer'
type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'late' | 'withdrawn' | 'rerolled' | 'catch_up_required' | 'catch_up_completed'

interface CourseSession {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    sessionNumber: number
    weekNumber: number
    title: string
    catchUp: boolean
    scheduledDate: Date
    completedAt?: Date
    catchUpRequired?: boolean
    sessionStatus?: 'scheduled' | 'completed' | 'cancelled'
    createdAt: Date
    updatedAt: Date
}

interface CourseCandidate {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    candidateNumber: number
    userId?: string
    displayName: string
    discordUsername?: string
    applicationId?: string
    status: CandidateStatus
    notes?: string
    addedById: string
    addedByName: string
    joinedAt: Date
    updatedAt: Date
}

interface PermanentCandidateCounter {
    _id: string
    seq: number
}

interface CourseStaffMember {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    userId: string
    displayName: string
    role: StaffRole
    addedById: string
    addedByName: string
    addedAt: Date
}

interface CandidateSessionAttendance {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    courseSessionId: string
    courseCandidateId: string
    candidateNumber: number
    status: AttendanceStatus
    notes?: string
    recordedById: string
    recordedByName: string
    createdAt: Date
    updatedAt: Date
}

interface CandidateEventFeedback {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    courseSessionId: string
    courseCandidateId: string
    candidateNumber: number
    eventKey: string
    positiveObservations: string
    negativeObservations: string
    lastEditedById: string
    lastEditedByName: string
    createdAt: Date
    updatedAt: Date
}

interface CourseSessionStaff {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    courseSessionId: string
    userId: string
    displayName: string
    role: StaffRole
    addedById: string
    addedByName: string
    addedAt: Date
}

interface CatchUpSelectedTeachingPoint {
    id: string
    sourceSessionNumber: number
    sourceSessionTitle: string
    teachingPoint: TrainingGuideTeachingPoint
}

interface CatchUpSelectedEquipment {
    id: string
    sourceSessionNumber: number
    text: string
}

interface CatchUpPlan {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    sessionId: string
    overview: string
    selectedTeachingPoints: CatchUpSelectedTeachingPoint[]
    selectedEquipment: CatchUpSelectedEquipment[]
    trainingAreaSourceSessionNumber?: number
    trainingAreaText?: string
    notes: string
    updatedAt: Date
    updatedById: string
    updatedByName: string
}

// ── Peer Review ───────────────────────────────────────────────────────────────

interface PeerReviewExtension {
    id: string
    requestedAt: Date
    reason?: string
    status: 'pending' | 'approved' | 'rejected'
    decidedAt?: Date
    decidedById?: string
    decidedByName?: string
    additionalMs?: number
    currentStage?: 'ranking' | 'feedback'
}

interface PeerReviewRound {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    status: 'draft' | 'sent' | 'unlocked' | 'completed'
    selectedCandidateIds: string[]          // courseCandidateId strings
    candidateCount: number
    rankingDurationMs: number
    feedbackDurationMs: number
    sentAt?: Date
    sentById?: string
    sentByName?: string
    unlockedAt?: Date
    unlockedById?: string
    unlockedByName?: string
    completedAt?: Date
    createdAt: Date
}

interface PeerReviewSubmission {
    _id?: import('mongodb').ObjectId
    roundId: string
    courseInstanceId: string
    reviewerCandidateId: string
    reviewerCandidateNumber: number
    reviewerUserId: string
    reviewerDisplayName: string
    status: 'waiting' | 'ready' | 'started' | 'ranking_complete' | 'feedback_active' | 'time_expired' | 'submitted'
    hasOpenedWaitingRoom: boolean
    isReady: boolean
    rankingStartedAt?: Date
    rankingCompletedAt?: Date
    feedbackStartedAt?: Date
    submittedAt?: Date
    ranking: string[]                       // ordered courseCandidateId array
    feedback: Record<string, { text: string; noFeedback: boolean }>
    rankingBonusMs: number                  // unused ranking time transferred to feedback
    rankingUsedMs?: number
    feedbackUsedMs?: number
    isIncomplete: boolean
    validationFlags: string[]
    extensions: PeerReviewExtension[]
    createdAt: Date
    updatedAt: Date
}

interface CourseActivityLog {
    _id?: import('mongodb').ObjectId
    courseInstanceId: string
    courseSessionId?: string
    courseCandidateId?: string
    candidateNumber?: number
    eventKey?: string
    action: string
    fieldName?: string
    previousValue?: string
    newValue?: string
    performedById: string
    performedByName: string
    createdAt: Date
}

type ChangeProposalEntityType = 'course_candidate' | 'candidate_feedback' | 'candidate_attendance' | 'training_record' | 'course_session' | 'course_instance'

interface ChangeProposal {
    _id?: import('mongodb').ObjectId
    entityType: ChangeProposalEntityType
    entityId: string
    courseInstanceId: string
    fieldPath: string
    previousValue: string
    proposedValue: string
    proposedBy: string
    proposedByName: string
    proposedAt: Date
    status: 'pending' | 'approved' | 'rejected'
    reviewedBy?: string
    reviewedByName?: string
    reviewedAt?: Date
    reviewComment?: string
    approvedValue?: string
    isDirectCorrection: boolean
}
