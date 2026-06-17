type TrainingApprovalStatus = 'pending' | 'approved' | 'rejected'
type TrainingEventStatus = 'Scheduled' | 'Completed' | 'Cancelled'
type TrainingBilletField = 'j3Bct12' | 'j3OtherTrainings'

interface TrainingType {
    _id?: import('mongodb').ObjectId
    name: string                        // matches CERTIFICATIONS label for qualification auto-award
    category: string                    // grouping label (e.g. 'BCT', 'Medical', 'Aviation')
    billetField: TrainingBilletField    // which trainer billet count increments on completion
    billetPoints: number                // 1 for BCT 1/2, 2 for all others
    description?: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

interface TrainingEvent {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string              // ref to TrainingType._id
    trainingTypeName: string            // denormalized
    title: string
    description?: string
    scheduledAt: Date
    durationMinutes?: number            // defaults to 60 when creating calendar event
    maxAttendees?: number               // capacity cap; no cap if undefined
    location?: string
    trainerId: string                   // Discord user ID
    trainerName: string
    status: TrainingEventStatus
    approvalStatus: TrainingApprovalStatus
    approvedById?: string
    approvedByName?: string
    approvedAt?: Date
    rejectionReason?: string
    calendarEventId?: string            // linked CalendarEvent._id if added to calendar
    completionNotes?: string
    billetField: TrainingBilletField     // denormalized from TrainingType on creation
    billetPointsAwarded: number         // denormalized from TrainingType.billetPoints on creation
    attendeeCount?: number              // denormalized on completion
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
}

interface TrainingAttendance {
    _id?: import('mongodb').ObjectId
    eventId: string                     // TrainingEvent._id as string
    memberId: string                    // Discord user ID
    memberName: string
    rsvpStatus: 'attending' | 'not_attending' | 'waitlist'
    attended?: boolean                  // confirmed by trainer when marking complete
    qualificationAwarded?: boolean      // true once cert added to milpac
    createdAt: Date
    updatedAt: Date
}

interface TrainingDocument {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string              // TrainingType._id as string
    title: string
    url: string
    description?: string
    approvalStatus: 'pending' | 'approved' | 'rejected'
    rejectionNote?: string
    approvedById?: string
    approvedByName?: string
    approvedAt?: Date
    uploadedById: string                // Discord user ID
    uploadedByName: string
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
}
