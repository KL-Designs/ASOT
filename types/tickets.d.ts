interface Ticket {
    _id?: import('mongodb').ObjectId
    type: 'j3-qualification'
    department: 'j3'
    status: 'open' | 'actioned' | 'rejected'
    action: 'add' | 'remove'
    qualification: string
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
}
