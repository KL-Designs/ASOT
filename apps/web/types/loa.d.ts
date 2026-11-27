interface MemberLoa {
    _id?: import('mongodb').ObjectId
    userId: string
    userName: string
    startDate: string
    endDate: string
    reason: string
    status: 'pending' | 'approved' | 'rejected'
    requiredApproverUserId?: string
    requiredApproverName?: string
    reviewedById?: string
    reviewedByName?: string
    reviewedAt?: Date
    reviewNote?: string
    issuedAt: Date
    department?: string
}
