interface CalendarEvent {
    _id?: import('mongodb').ObjectId
    title: string
    description?: string
    start: Date
    end: Date
    allDay?: boolean
    department: 'j1' | 'j2' | 'j3' | 'j4' | 'j6' | 'j7' | 'unit'
    isPrivate?: boolean                   // if true, only visible to createdById
    templateTrainingTypeId?: string       // set if created from a J3 training type template
    courseInstanceId?: string
    createdById: string
    createdByName: string
    createdAt: Date

    // J2-specific event types
    isJ2Unavailability?: boolean          // J2 Lead blocking unavailability on the calendar
    isMissionCheckRequest?: boolean       // Mission maker requesting a J2 check
    relatedOperationId?: string           // Operation ID linked to a mission check request
    relatedOperationTitle?: string        // Operation title at time of request
    relatedTaskId?: string                // Task created alongside a mission check request
}

interface CalendarReminder {
    _id?: import('mongodb').ObjectId
    userId: string          // Discord user ID
    eventId: string         // CalendarEvent _id as string
    eventTitle: string
    eventStart: Date
    minutesBefore: number   // how many minutes before the event to fire
    fireAt: Date            // = eventStart - minutesBefore * 60_000
    firedAt?: Date          // set once the notification has been sent
    createdAt: Date
}
