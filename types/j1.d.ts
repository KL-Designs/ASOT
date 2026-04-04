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
    // Extended fields
    steamUrl?: string
    region?: string
    armaHours?: string
    priorMilsim?: boolean
    dualClan?: boolean
    previousUnits?: string
    availableNights?: string
    opsPerMonth?: string
    primaryRole?: string
    additionalRoles?: string[]
    departmentInterest?: string[]
    ownsArma?: boolean
}
