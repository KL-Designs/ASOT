'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enAU } from 'date-fns/locale'
import { Button, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'
import { Add } from '@mui/icons-material'
import EventModal, { CalendarEventRow, DEPT_COLORS } from '@/app/admin/unit/calendar/EventModal'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/app/admin/unit/calendar/calendar-overrides.css'

const locales = { 'en-AU': enAU }

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales,
})

type RbcEvent = {
    id: string
    title: string
    start: Date
    end: Date
    allDay?: boolean
    resource: CalendarEventRow
}

interface DeptCalendarTabProps {
    department: string
    userId: string
    isJ4: boolean
}

export default function DeptCalendarTab({ department, userId, isJ4 }: DeptCalendarTabProps) {
    const [events, setEvents] = useState<RbcEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | undefined>(undefined)
    const [currentView, setCurrentView] = useState<View>(Views.MONTH)
    const [currentDate, setCurrentDate] = useState(new Date())

    const fetchEvents = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/calendar?department=${department}`)
            const data = await res.json()
            setEvents(
                (data.events ?? []).map((e: CalendarEventRow) => ({
                    id: e._id,
                    title: e.title,
                    start: new Date(e.start),
                    end: new Date(e.end),
                    allDay: e.allDay ?? false,
                    resource: e,
                }))
            )
        } finally {
            setLoading(false)
        }
    }, [department])

    useEffect(() => { fetchEvents() }, [fetchEvents])

    function handleSelectEvent(event: RbcEvent) {
        setSelectedEvent(event.resource)
        setModalOpen(true)
    }

    function handleAddClick() {
        setSelectedEvent(undefined)
        setModalOpen(true)
    }

    const deptColor = DEPT_COLORS[department] ?? 'rgba(219,0,29,0.8)'

    return (
        <div className='p-5 flex flex-col gap-4' style={{ minHeight: 500 }}>
            {/* Add button */}
            <div className='flex items-center justify-between'>
                <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Department Calendar
                </Typography>
                <Button
                    variant='outlined'
                    size='small'
                    startIcon={<Add sx={{ fontSize: 14 }} />}
                    onClick={handleAddClick}
                    sx={{
                        borderRadius: 0,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        borderColor: 'rgba(219,0,29,0.42)',
                        color: 'var(--red)',
                        '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                    }}
                >
                    Add Event
                </Button>
            </div>

            {/* Calendar */}
            <div style={{ flex: 1, minHeight: 460 }}>
                {loading ? (
                    <TacticalSkeleton rows={7} className='px-4' />
                ) : (
                    <Calendar
                        localizer={localizer}
                        events={events}
                        view={currentView}
                        onView={setCurrentView}
                        date={currentDate}
                        onNavigate={setCurrentDate}
                        views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                        onSelectEvent={handleSelectEvent}
                        eventPropGetter={() => ({
                            style: {
                                backgroundColor: deptColor,
                                color: '#fff',
                                border: 'none',
                                borderRadius: 0,
                            },
                        })}
                        style={{ height: 540 }}
                        popup
                    />
                )}
            </div>

            <EventModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={fetchEvents}
                defaultDepartment={department}
                event={selectedEvent}
                userId={userId}
                isJ4={isJ4}
            />
        </div>
    )
}
