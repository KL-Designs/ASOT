'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enAU } from 'date-fns/locale'
import { Typography, Button } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'
import { Add } from '@mui/icons-material'
import EventModal, { CalendarEventRow, DEPT_COLORS } from './EventModal'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './calendar-overrides.css'

const locales = { 'en-AU': enAU }

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales,
})

const DEPT_LEGEND: { key: string; label: string }[] = [
    { key: 'unit', label: 'Unit' },
    { key: 'j1', label: 'J1' },
    { key: 'j2', label: 'J2 / Operations' },
    { key: 'j3', label: 'J3' },
    { key: 'j4', label: 'J4' },
    { key: 'j6', label: 'J6' },
    { key: 'j7', label: 'J7' },
]

type RbcEvent = {
    id: string
    title: string
    start: Date
    end: Date
    allDay?: boolean
    resource: CalendarEventRow
}

export default function CalendarPanel({ userId, displayName, isJ4 }: { userId: string; displayName: string; isJ4: boolean }) {
    const [events, setEvents] = useState<RbcEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | undefined>(undefined)
    const [currentView, setCurrentView] = useState<View>(Views.MONTH)
    const [currentDate, setCurrentDate] = useState(new Date())

    // Filtering state — null means "all visible"
    const [activeDepts, setActiveDepts] = useState<Set<string> | null>(null)
    const [opsOnly, setOpsOnly] = useState(false)

    const fetchEvents = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/calendar')
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
    }, [])

    useEffect(() => { fetchEvents() }, [fetchEvents])

    function toggleDept(key: string) {
        setActiveDepts(prev => {
            // If nothing is filtered yet, clicking a dept means "show only this one"
            if (prev === null) return new Set([key])
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
                // If nothing left, go back to "show all"
                if (next.size === 0) return null
            } else {
                next.add(key)
            }
            return next
        })
    }

    function clearFilters() {
        setActiveDepts(null)
        setOpsOnly(false)
    }

    const isFiltered = activeDepts !== null || opsOnly

    const filteredEvents = events.filter(e => {
        if (opsOnly && !e.resource.isOperation) return false
        if (activeDepts !== null && !activeDepts.has(e.resource.department)) return false
        return true
    })

    function handleSelectEvent(event: RbcEvent) {
        setSelectedEvent(event.resource)
        setModalOpen(true)
    }

    function handleAddClick() {
        setSelectedEvent(undefined)
        setModalOpen(true)
    }

    return (
        <div className='h-full w-full flex flex-col max-w-[1300px]'>
            {/* Header */}
            <div
                className='flex items-center justify-between px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.3)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                        Unit
                    </Typography>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Calendar
                    </Typography>
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                        All department events
                    </Typography>
                </div>
                <Button
                    variant='outlined'
                    size='small'
                    startIcon={<Add sx={{ fontSize: 14 }} />}
                    onClick={handleAddClick}
                    sx={{
                        borderRadius: 0,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        borderColor: 'rgba(219,0,29,0.4)',
                        color: 'var(--red)',
                        '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                    }}
                >
                    Add Event
                </Button>
            </div>

            {/* Legend / filters */}
            <div className='mx-6 mt-3 flex flex-wrap items-center gap-x-5 gap-y-2' style={{ paddingBottom: 4 }}>
                {DEPT_LEGEND.map(d => {
                    const isActive = activeDepts === null || activeDepts.has(d.key)
                    return (
                        <button
                            key={d.key}
                            onClick={() => toggleDept(d.key)}
                            title={isActive ? `Hide ${d.label}` : `Show only ${d.label}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                                opacity: isActive ? 1 : 0.35,
                                transition: 'opacity 0.15s',
                            }}
                        >
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: DEPT_COLORS[d.key], flexShrink: 0 }} />
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(237,237,237,0.55)' }}>
                                {d.label}
                            </span>
                        </button>
                    )
                })}

                {/* Divider */}
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

                {/* Operations-only toggle */}
                <button
                    onClick={() => setOpsOnly(v => !v)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                        opacity: opsOnly ? 1 : 0.45,
                        transition: 'opacity 0.15s',
                    }}
                    title='Show operations only'
                >
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: DEPT_COLORS['j2'], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(237,237,237,0.55)' }}>
                        Ops Only
                    </span>
                </button>

                {/* Clear filters */}
                {isFiltered && (
                    <button
                        onClick={clearFilters}
                        style={{
                            background: 'none', border: '1px solid rgba(219,0,29,0.3)', cursor: 'pointer',
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: 'rgba(219,0,29,0.7)', padding: '2px 10px',
                            transition: 'border-color 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(219,0,29,0.7)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(219,0,29,1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(219,0,29,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(219,0,29,0.7)' }}
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Calendar */}
            <div className='flex-1 min-h-0 mx-6 mb-6 mt-3' style={{ minHeight: 500 }}>
                {loading ? (
                    <TacticalSkeleton rows={7} className='px-4' />
                ) : (
                    <Calendar
                        localizer={localizer}
                        events={filteredEvents}
                        view={currentView}
                        onView={setCurrentView}
                        date={currentDate}
                        onNavigate={setCurrentDate}
                        views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                        onSelectEvent={handleSelectEvent}
                        eventPropGetter={event => ({
                            style: {
                                backgroundColor: DEPT_COLORS[event.resource?.department] ?? 'rgba(219,0,29,0.8)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 0,
                            },
                        })}
                        style={{ height: 620 }}
                        popup
                    />
                )}
            </div>

            <EventModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={fetchEvents}
                event={selectedEvent}
                userId={userId}
                isJ4={isJ4}
            />
        </div>
    )
}
