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
    /**
     * Material a member works through before a session of this training.
     * Locked until they hold a seat (or are in the first two on the waitlist)
     * and open for two weeks from then — see lib/training/pre-learning.ts.
     * Never sent to a member by the types API; only `/api/training/pre-learning`
     * hands it out, and only while it is open to them.
     */
    preLearning?: TrainingMedia[]
    // Ordering
    sortOrder?: number
    // Course type — only set for Selection / Reinforcement Cycle categories
    courseType?: 'selection' | 'reinforcement_cycle'
    /** Row 372: the course's document areas. Unset means the defaults (`lib/training/document-slots.ts`). */
    documentSlots?: import('@/lib/training/document-slots').DocumentSlot[]
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
    /** Members a J3 lead or this session's trainer has let sign up as a trainee
     *  without the training's prerequisites. Per session, not per member: a
     *  waiver for one night is not a standing exemption. */
    prerequisiteWaivers?: { memberId: string; memberName: string; byId: string; byName: string; at: Date }[]
    /** Minutes before the start that reminders go out (row 213). Unset on
     *  events saved before this existed, which keep the old 60 and 15. */
    reminderOffsets?: number[]
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
    /** On a waitlisted trainee: goes ahead of everybody without it. Earned by
     *  finishing the pre-learning and then missing the session it was for. */
    priority?: boolean
    attended?: boolean
    qualificationAwarded?: boolean
    createdAt: Date
    updatedAt: Date
}

/** One member's access to one training's pre-learning. One document per
 *  (trainingTypeId, memberId); an expired one is reset, not kept. */
interface TrainingPreLearning {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    memberId: string
    /** The session whose seat unlocked it. */
    eventId: string
    unlockedAt: Date
    completedAt?: Date
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
    deletedById?: string
    deletedByName?: string
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
    minutesBefore: number      // see lib/training/reminder-offsets.ts
    /** 'course' = a Selection / Reinforcement Cycle Session 1 reminder; eventId is then `course:{instanceId}`. Unset = a training event. */
    kind?: 'event' | 'course'
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
