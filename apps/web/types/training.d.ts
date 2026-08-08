type TrainingApprovalStatus = 'pending' | 'approved' | 'rejected'
type TrainingEventStatus = 'Scheduled' | 'Completed' | 'Cancelled'
type TrainingBilletField = 'j3Bct12' | 'j3OtherTrainings'
type TrainingTypeStatus = 'active' | 'wip' | 'inactive'
type TrainingTicketStatus = 'pending' | 'approved' | 'amendments_requested' | 'rejected'
type TrainingSlotType = 'trainer' | 'trainee' | 'sit-in'

interface TrainingMedia {
    type: 'video' | 'file' | 'url'
    label: string
    url: string
}

interface TrainingType {
    _id?: import('mongodb').ObjectId
    name: string
    category: string
    billetField: TrainingBilletField
    billetPoints: number
    description?: string
    // Status (replaces plain isActive — kept for backward compat)
    status: TrainingTypeStatus          // 'active' | 'wip' | 'inactive'
    isActive: boolean                   // derived: status === 'active'
    // Event defaults
    durationMinutes?: number
    server?: string
    requiredMods?: string[]
    prerequisites?: string[]
    minTrainers?: number
    minTrainees?: number
    // Documents & media
    trainerDocUrl?: string
    infoDocUrl?: string
    coverImageUrl?: string
    linkedMedia?: TrainingMedia[]
    // Ordering
    sortOrder?: number
    // Course type — only set for Selection / Reinforcement Cycle categories
    courseType?: 'selection' | 'reinforcement_cycle'
    createdAt: Date
    updatedAt: Date
}

interface TrainingEvent {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    trainingTypeName: string
    title: string
    description?: string
    scheduledAt: Date
    estimatedFinishAt?: Date
    durationMinutes?: number
    server?: string
    requiredMods?: string[]
    linkedMedia?: TrainingMedia[]
    maxAttendees?: number
    trainerSlots: number                // number of trainer slots (default 1)
    maxTraineeSlots?: number            // cap on trainees (undefined = use maxAttendees)
    maxSitInSlots?: number              // cap on sit-ins (undefined = unlimited)
    location?: string
    trainerId: string                   // primary trainer Discord user ID
    trainerName: string
    createdById?: string                // event creator (may differ from trainerId)
    createdByName?: string
    status: TrainingEventStatus
    approvalStatus: TrainingApprovalStatus
    approvedById?: string
    approvedByName?: string
    approvedAt?: Date
    rejectionReason?: string
    calendarEventId?: string
    completionNotes?: string
    billetField: TrainingBilletField
    billetPointsAwarded: number
    attendeeCount?: number
    isJ3Training: boolean               // false = All Staff (non-J3) training
    ticketId?: string                   // linked TrainingTicket._id after completion
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
}

interface TrainingAttendance {
    _id?: import('mongodb').ObjectId
    eventId: string
    memberId: string
    memberName: string
    slotType: TrainingSlotType          // which slot this RSVP occupies
    rsvpStatus: 'attending' | 'not_attending' | 'waitlist'
    attended?: boolean
    qualificationAwarded?: boolean
    createdAt: Date
    updatedAt: Date
}

interface TrainingDocument {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    title: string
    url: string
    description?: string
    approvalStatus: 'pending' | 'approved' | 'rejected'
    rejectionNote?: string
    approvedById?: string
    approvedByName?: string
    approvedAt?: Date
    uploadedById: string
    uploadedByName: string
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
}

interface TrainingRequest {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    trainingTypeName: string
    requestedById: string
    requestedByName: string
    preferredAt?: Date
    description?: string
    status: 'pending' | 'approved' | 'rejected' | 'cancellation_requested' | 'cancelled'
    interestedCount: number
    interestedUserIds: string[]
    approvedEventId?: string
    cancellationRequestedAt?: Date
    cancellationRequestedByName?: string
    rejectedReason?: string
    createdAt: Date
    updatedAt: Date
}

interface TrainingTicketAttendee {
    memberId: string
    memberName: string
    slotType: TrainingSlotType
    attended: boolean
    passed?: boolean
    notes?: string
    qualificationAwarded?: boolean
    billetPointsAwarded?: boolean
}

interface TrainingReminderRecord {
    _id?: import('mongodb').ObjectId
    eventId: string
    eventTitle: string
    minutesBefore: number      // 60 or 15
    fireAt: Date
    firedAt?: Date
    createdAt: Date
}

interface TrainingTicket {
    _id?: import('mongodb').ObjectId
    eventId: string
    trainingTypeId: string
    trainingTypeName: string
    trainerId: string
    trainerName: string
    scheduledAt: Date
    completedAt: Date
    status: TrainingTicketStatus        // 'pending' | 'approved' | 'amendments_requested' | 'rejected'
    attendees: TrainingTicketAttendee[]
    trainerNotes?: string
    j3Notes?: string
    amendmentNotes?: string
    reviewedById?: string
    reviewedByName?: string
    reviewedAt?: Date
    billetPointsAwarded?: boolean
    qualificationsAwarded?: boolean
    isJ3Training: boolean
    createdAt: Date
    updatedAt: Date
}
