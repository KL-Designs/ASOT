interface Ticket {
    _id?: import('mongodb').ObjectId
    type: 'j3-qualification' | 'j4-award'
    department: 'j3' | 'j4'
    status: 'open' | 'actioned' | 'rejected'
    targetUserId: string
    targetUserName: string
    issuedById: string
    issuedByName: string
    issuedAt: Date
    notes?: string
    actionedById?: string
    actionedByName?: string
    actionedAt?: Date
    actionNotes?: string
    // J3 qualification fields (undefined on j4-award tickets)
    action?: 'add' | 'remove'
    qualification?: string
    // J4 award fields (undefined on j3-qualification tickets)
    awardName?: string
    awardType?: string
}
