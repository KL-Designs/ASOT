interface J1Application {
    _id?: import('mongodb').ObjectId
    discordUsername: string
    inGameName: string
    age: number
    experience: string
    status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
    submittedAt: Date
    submittedIp?: string
    reviewedBy?: string
    reviewedAt?: Date
    notes?: string
    isDirectRecruit?: boolean
    recruiter?: string
    linkedUserId?: string
    linkedUserDisplayName?: string
}
