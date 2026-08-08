type CourseInstanceStatus = 'planning' | 'active' | 'in_progress' | 'completed' | 'cancelled' | 'archived'
type CourseInstanceType = 'selection' | 'reinforcement_cycle' | 'historical'

interface CourseInstance {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    trainingTypeName: string
    courseType: CourseInstanceType
    instanceNumber: number
    instanceRef: string             // e.g. "SEL-001" or "RC-001"
    status: CourseInstanceStatus
    session1Date?: Date
    startDate?: Date
    endDate?: Date
    leadInstructorId?: string
    leadInstructorName?: string
    candidateCount?: number
    passedCount?: number
    failedCount?: number
    withdrawnCount?: number
    staffCount?: number
    instructors?: Array<{ userId: string; displayName: string; role: StaffRole }>
    isLocked?: boolean
    lockedAt?: Date
    lockedById?: string
    lockedByName?: string
    notes?: string
    calendarEventIds?: string[]
    createdById: string
    createdByName: string
    createdAt: Date
    updatedAt: Date
    completedAt?: Date
    cancelledAt?: Date
    cancelledById?: string
    cancelledByName?: string
    deletedAt?: Date
    deletedById?: string
    deletedByName?: string
    // Historical import fields
    isHistoricalImport?: boolean
    importBatchId?: string
    sourceSheetId?: string
    sourceRowRange?: string           // e.g. "42-45" (rows consolidated into this record)
    legacyTicketRef?: string
    historicalTrainees?: string[]     // raw names from sheet (no user matching)
    historicalStaff?: string[]        // raw names from sheet
}

interface CourseInstanceCounter {
    _id: string     // trainingTypeId
    seq: number
}
