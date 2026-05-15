interface RecruitSession {
    _id?: import('mongodb').ObjectId
    sessionId: string
    recruiterId: string
    recruiterName: string
    recruiterToken: string
    step: number
    raisedHand: boolean
    applicantName: string | null
    formSnapshot: Record<string, unknown>
    createdAt: Date
    lastActivity: Date
    expiresAt: Date
}
