interface Ticket {
    _id?: import('mongodb').ObjectId
    type: 'j3-qualification' | 'j4-award' | 'j3-promotion' | 'move-request' | 'j4-discharge' | 'discipline' | 'department-membership' | 'performance-report'
    department: 'j3' | 'j4' | 'allstaff' | 'j1' | 'j2' | 'j6' | 'j7'
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
    // J3 qualification fields (undefined on other types)
    action?: 'add' | 'remove' | 'promote' | 'demote'
    qualification?: string
    // J4 award fields (undefined on other types)
    awardName?: string
    awardType?: string
    // J3 promotion fields (undefined on other types)
    proposedRank?: string
    // Move request fields (undefined on other types)
    fromPositionId?: string
    fromSectionTitle?: string
    fromCategory?: string
    fromPositionRole?: string
    fromIsReservist?: boolean
    toPositionId?: string | null
    toSectionTitle?: string
    toCategory?: string
    toPositionRole?: string
    toIsReservist?: boolean
    requiredApproverUserId?: string
    requiredApproverName?: string
    // Discharge fields (undefined on other types)
    dischargeType?: 'honorable' | 'dishonorable'
    dischargeReason?: string
    // Discipline fields (undefined on other types)
    disciplineReason?: string
    actionedPointsDeducted?: number
    // Performance report fields (undefined on other types)
    performanceReason?: string
    // Department membership fields (undefined on other types)
    deptCode?: string
    memberAction?: 'add' | 'remove' | 'set-lead' | 'remove-lead'
}
