interface Ticket {
    _id?: import('mongodb').ObjectId
    type: 'j3-qualification' | 'j4-award' | 'j3-promotion'
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
    // J3 qualification fields (undefined on j4-award / j3-promotion tickets)
    action?: 'add' | 'remove' | 'promote' | 'demote'
    qualification?: string
    // J4 award fields (undefined on other types)
    awardName?: string
    awardType?: string
    // J3 promotion fields (undefined on other types)
    proposedRank?: string
}
