type MeetingDepartment = 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6' | 'j7'

interface MeetingAttachment {
    id: string
    type: 'file' | 'youtube'
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
    reminderDate?: Date
    status: 'pending' | 'in_progress' | 'completed'
    completedAt?: Date
    completedByName?: string
    createdBy: string
    createdByName: string
    createdAt: Date
}

interface Meeting {
    _id?: import('mongodb').ObjectId
    department: MeetingDepartment
    title: string
    date: Date
    notes?: string
    tasks: MeetingTask[]
    attachments: MeetingAttachment[]
    locked: boolean
    lockedBy?: string
    lockedByName?: string
    lockedAt?: Date
    createdBy: string
    createdByName: string
    createdAt: Date
    updatedAt: Date
}
