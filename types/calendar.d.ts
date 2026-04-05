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
