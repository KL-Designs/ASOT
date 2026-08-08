type MeetingDepartment = 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6' | 'j7'

interface MeetingAttachment {
    id: string
    type: 'file' | 'youtube' | 'link'
    filename?: string
    url: string
    ext?: string
    uploadedBy: string
    uploadedByName: string
    uploadedAt: Date
}

interface MeetingTask {
    id: string
    title: string
    description?: string
    assignedTo?: string
    assignedToName?: string
    assignedRole?: string
    dueDate?: Date
    chaseUpDate?: Date
    carriedOverFrom?: string
    status: 'pending' | 'in_progress' | 'completed'
    completedAt?: Date
    completedByName?: string
    createdBy: string
    createdByName: string
    createdAt: Date
}

interface MeetingAttendee {
    userId: string
    displayName: string
    // j4 = J4 Admin member, dept_lead = dept lead role holder, dept_member = regular dept member, invited = non-dept invite
    group: 'j4' | 'dept_lead' | 'dept_member' | 'invited'
    status: 'pending' | 'attending' | 'not_attending' | 'loa' | 'confirmed_attended' | 'confirmed_absent'
    respondedAt?: Date
    confirmedBy?: string
    confirmedByName?: string
    confirmedAt?: Date
}

interface MeetingTransferSource {
    meetingId: string
    department: MeetingDepartment
    title: string
    date: Date
    transferredBy: string
    transferredByName: string
    transferredAt: Date
}

interface Meeting {
    _id?: import('mongodb').ObjectId
    department: MeetingDepartment
    title: string
    date: Date
    // Transfer metadata — set when this meeting is a cross-dept import
    isTransferred?: boolean
    transferredFrom?: MeetingTransferSource
    notes?: string
    tasks: MeetingTask[]
    attachments: MeetingAttachment[]
    attendees: MeetingAttendee[]
    // Non-dept members invited specifically to this meeting (temporary access)
    invitedUserIds?: string[]
    locked: boolean
    lockedBy?: string
    lockedByName?: string
    lockedAt?: Date
    // Completion
    completed?: boolean
    completedAt?: Date
    completedBy?: string
    completedByName?: string
    // Attendance confirmation (after completion)
    attendanceConfirmed?: boolean
    attendanceConfirmedAt?: Date
    attendanceConfirmedBy?: string
    attendanceConfirmedByName?: string
    attendanceConfirmationDeadline?: Date
    attendanceReminderSent?: boolean
    // Notification targets (set at creation)
    notifyRoles?: string[]
    notifyUserIds?: string[]
    reminderDate?: Date
    reminderSent?: boolean
    createdBy: string
    createdByName: string
    createdAt: Date
    updatedAt: Date
}
