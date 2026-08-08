interface MeetingNotifQueueRecord {
    _id?: import('mongodb').ObjectId
    meetingId: string
    taskId?: string
    type: NotificationType
    notifyTitle: string
    notifyBody: string
    actionUrl: string
    fireAt: Date
    firedAt?: Date
    recipientUserId?: string   // mutually exclusive with recipientRole
    recipientRole?: string
}
