interface CalendarEvent {
    _id?: import('mongodb').ObjectId
    title: string
    description?: string
    start: Date
    end: Date
    allDay?: boolean
    department: 'j1' | 'j2' | 'j3' | 'j4' | 'j6' | 'j7' | 'unit'
    createdById: string
    createdByName: string
    createdAt: Date
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
