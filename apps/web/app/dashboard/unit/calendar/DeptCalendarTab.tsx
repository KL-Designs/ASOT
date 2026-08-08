'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enAU } from 'date-fns/locale'
import { Button, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { Add, Block, AssignmentLate } from '@mui/icons-material'
import EventModal, { CalendarEventRow, DEPT_COLORS } from '@/app/dashboard/unit/calendar/EventModal'
import J2EventModal from '@/app/dashboard/unit/calendar/J2EventModal'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/app/dashboard/unit/calendar/calendar-overrides.css'

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
    resource: CalendarEventRow & { isBCTAvailability?: boolean }
}

interface DeptCalendarTabProps {
    department: string
    userId: string
    isJ4: boolean
    isJ2Lead?: boolean
}

export default function DeptCalendarTab({ department, userId, isJ4, isJ2Lead }: DeptCalendarTabProps) {
    const [events, setEvents] = useState<RbcEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | undefined>(undefined)
    const [currentView, setCurrentView] = useState<View>(Views.MONTH)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [showBCT, setShowBCT] = useState(true)
    const [showQuiz, setShowQuiz] = useState(true)
    const [showUnavailability, setShowUnavailability] = useState(true)
    const [showMissionChecks, setShowMissionChecks] = useState(true)
    const [j2Modal, setJ2Modal] = useState<'unavailability' | 'mission_check' | null>(null)

    const isJ2Calendar = department === 'j2'

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

    const hasBCT = events.some(e => e.resource?.isBCTAvailability && !e.resource?.isQuizAvailability)
    const hasQuiz = events.some(e => e.resource?.isQuizAvailability)
    const hasUnavailability = isJ2Calendar && events.some(e => e.resource?.isJ2Unavailability)
    const hasMissionChecks = isJ2Calendar && events.some(e => e.resource?.isMissionCheckRequest)

    const visibleEvents = events.filter(e => {
        if (e.resource?.isQuizAvailability) return showQuiz
        if (e.resource?.isBCTAvailability) return showBCT
        if (e.resource?.isJ2Unavailability) return showUnavailability
        if (e.resource?.isMissionCheckRequest) return showMissionChecks
        return true
    })

    return (
        <div className='p-5 flex flex-col gap-4' style={{ minHeight: 500 }}>
            {/* Header row */}
            <div className='flex items-center justify-between gap-3' style={{ flexWrap: 'wrap' }}>
                <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Department Calendar
                </Typography>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* BCT Availability filter */}
                    {hasBCT && (
                        <button
                            onClick={() => setShowBCT(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                background: showBCT ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                                border: showBCT ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                color: showBCT ? '#10b981' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{ width: 8, height: 8, border: `2px dashed ${showBCT ? '#10b981' : 'rgba(237,237,237,0.2)'}`, borderRadius: 1, flexShrink: 0 }} />
                            BCT Availability
                        </button>
                    )}
                    {/* Quiz Availability filter */}
                    {hasQuiz && (
                        <button
                            onClick={() => setShowQuiz(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                background: showQuiz ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                                border: showQuiz ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                color: showQuiz ? '#8b5cf6' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{ width: 8, height: 8, border: `2px dashed ${showQuiz ? '#8b5cf6' : 'rgba(237,237,237,0.2)'}`, borderRadius: 1, flexShrink: 0 }} />
                            Quiz Availability
                        </button>
                    )}
                    {/* J2 Unavailability filter */}
                    {hasUnavailability && (
                        <button
                            onClick={() => setShowUnavailability(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                background: showUnavailability ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                                border: showUnavailability ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                color: showUnavailability ? '#ef4444' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{ width: 8, height: 8, border: `2px dashed ${showUnavailability ? '#ef4444' : 'rgba(237,237,237,0.2)'}`, borderRadius: 1, flexShrink: 0 }} />
                            Unavailability
                        </button>
                    )}
                    {/* J2 Mission Check filter */}
                    {hasMissionChecks && (
                        <button
                            onClick={() => setShowMissionChecks(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                background: showMissionChecks ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                                border: showMissionChecks ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                color: showMissionChecks ? '#3b82f6' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{ width: 8, height: 8, border: `2px dashed ${showMissionChecks ? '#3b82f6' : 'rgba(237,237,237,0.2)'}`, borderRadius: 1, flexShrink: 0 }} />
                            Mission Checks
                        </button>
                    )}

                    {/* J2-specific action buttons */}
                    {isJ2Calendar && isJ2Lead && (
                        <Button
                            variant='outlined'
                            size='small'
                            startIcon={<Block sx={{ fontSize: 13 }} />}
                            onClick={() => setJ2Modal('unavailability')}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                borderColor: 'rgba(239,68,68,0.42)',
                                color: '#ef4444',
                                '&:hover': { borderColor: '#ef4444', background: 'rgba(239,68,68,0.06)' },
                            }}
                        >
                            Block Unavailability
                        </Button>
                    )}
                    {isJ2Calendar && (
                        <Button
                            variant='outlined'
                            size='small'
                            startIcon={<AssignmentLate sx={{ fontSize: 13 }} />}
                            onClick={() => setJ2Modal('mission_check')}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                borderColor: 'rgba(59,130,246,0.42)',
                                color: '#3b82f6',
                                '&:hover': { borderColor: '#3b82f6', background: 'rgba(59,130,246,0.06)' },
                            }}
                        >
                            Request Mission Check
                        </Button>
                    )}

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
            </div>

            {/* Calendar */}
            <div style={{ flex: 1, minHeight: 460 }}>
                {loading ? (
                    <TacticalSkeleton rows={7} className='px-4' />
                ) : (
                    <Calendar
                        localizer={localizer}
                        events={visibleEvents}
                        view={currentView}
                        onView={setCurrentView}
                        date={currentDate}
                        onNavigate={setCurrentDate}
                        views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                        onSelectEvent={handleSelectEvent}
                        eventPropGetter={(event: RbcEvent) => {
                            if (event.resource?.isQuizAvailability) {
                                return {
                                    style: {
                                        backgroundColor: 'rgba(139,92,246,0.55)',
                                        borderLeft: '3px solid rgba(139,92,246,0.9)',
                                        color: '#fff',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderRadius: 0,
                                        fontSize: '0.68rem',
                                    },
                                }
                            }
                            if (event.resource?.isBCTAvailability) {
                                return {
                                    style: {
                                        backgroundColor: 'rgba(16,185,129,0.55)',
                                        borderLeft: '3px solid rgba(16,185,129,0.9)',
                                        color: '#fff',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderRadius: 0,
                                        fontSize: '0.68rem',
                                    },
                                }
                            }
                            if (event.resource?.isJ2Unavailability) {
                                return {
                                    style: {
                                        backgroundColor: 'rgba(239,68,68,0.55)',
                                        borderLeft: '3px solid rgba(239,68,68,0.9)',
                                        color: '#fff',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderRadius: 0,
                                        fontSize: '0.68rem',
                                    },
                                }
                            }
                            if (event.resource?.isMissionCheckRequest) {
                                return {
                                    style: {
                                        backgroundColor: 'rgba(59,130,246,0.55)',
                                        borderLeft: '3px solid rgba(59,130,246,0.9)',
                                        color: '#fff',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderRadius: 0,
                                        fontSize: '0.68rem',
                                    },
                                }
                            }
                            return {
                                style: {
                                    backgroundColor: deptColor,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 0,
                                },
                            }
                        }}
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

            {j2Modal && (
                <J2EventModal
                    open={!!j2Modal}
                    onClose={() => setJ2Modal(null)}
                    onSaved={fetchEvents}
                    mode={j2Modal}
                />
            )}
        </div>
    )
}
