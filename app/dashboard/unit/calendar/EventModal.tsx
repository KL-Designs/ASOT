'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, FormControlLabel, Switch,
    CircularProgress, Alert, Typography, Divider, Portal,
} from '@mui/material'
import { Delete, Close, OpenInNew, NotificationsNone, NotificationsActive } from '@mui/icons-material'

export type CalendarEventRow = {
    _id: string
    title: string
    description?: string
    start: string
    end: string
    allDay?: boolean
    department: string
    createdById: string
    createdByName: string
    createdAt: string
    isOperation?: boolean
    operationId?: string
    isBCTAvailability?: boolean
    isQuizAvailability?: boolean
    applicantId?: string
    applicantName?: string
    timePeriod?: string
    isJ2Unavailability?: boolean
    isMissionCheckRequest?: boolean
    relatedOperationId?: string
    relatedOperationTitle?: string
    relatedTaskId?: string
}

const COURSE_STATUS_STYLE: Record<string, { color: string; border: string }> = {
    'Planning':    { color: 'rgba(255,180,50,0.9)',  border: 'rgba(255,180,50,0.3)'  },
    'In Progress': { color: 'rgba(80,200,120,0.9)',  border: 'rgba(80,200,120,0.3)'  },
    'Completed':   { color: 'rgba(100,160,240,0.9)', border: 'rgba(100,160,240,0.3)' },
    'Cancelled':   { color: 'rgba(237,237,237,0.5)', border: 'rgba(255,255,255,0.1)' },
}

export const DEPT_COLORS: Record<string, string> = {
    j1: '#3b82f6',
    j2: '#8b5cf6',
    j3: '#10b981',
    j4: '#ef4444',
    j6: '#f59e0b',
    j7: '#06b6d4',
    unit: 'rgba(219,0,29,0.85)',
}

const DEPT_LABELS: Record<string, string> = {
    j1: 'J1 — Recruitment',
    j2: 'J2 — Mission Making',
    j3: 'J3 — Training',
    j4: 'J4 — Administration',
    j6: 'J6 — Game Masters',
    j7: 'J7 — Development',
    unit: 'Unit (All Staff)',
}

function toLocalDatetimeValue(iso: string) {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDateValue(iso: string) {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDisplay(iso: string, allDay?: boolean) {
    const d = new Date(iso)
    if (allDay) return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const LEAD_UP_PRESETS = [15, 30, 60, 120, 360, 1440]

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

interface EventModalProps {
    open: boolean
    onClose: () => void
    onSaved: () => void
    defaultDepartment?: string
    event?: CalendarEventRow
    userId: string
    isJ4: boolean
}

export default function EventModal({ open, onClose, onSaved, defaultDepartment, event, userId, isJ4 }: EventModalProps) {
    const isViewMode = !!event

    // Create mode state
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
    const defaultEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours() + 1)}:00`

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [start, setStart] = useState(defaultStart)
    const [end, setEnd] = useState(defaultEnd)
    const [allDay, setAllDay] = useState(false)
    const [department, setDepartment] = useState(defaultDepartment ?? 'unit')
    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirming, setDeleteConfirming] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reminder state (view mode only)
    const [reminderEnabled, setReminderEnabled] = useState(false)
    const [leadUpEnabled, setLeadUpEnabled] = useState(false)
    const [leadUpMinutes, setLeadUpMinutes] = useState(60)
    const [leadUpPreset, setLeadUpPreset] = useState<number | 'custom'>(60)
    const [customAmount, setCustomAmount] = useState(90)
    const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('minutes')
    const [reminderLoading, setReminderLoading] = useState(false)
    const [reminderSaving, setReminderSaving] = useState(false)

    function computeCustomMinutes(amount: number, unit: 'minutes' | 'hours' | 'days') {
        if (unit === 'hours') return amount * 60
        if (unit === 'days') return amount * 1440
        return amount
    }

    useEffect(() => {
        if (!open || !event) return
        setReminderLoading(true)
        fetch(`/api/admin/calendar/reminders?eventId=${event._id}`)
            .then(r => r.json())
            .then(data => {
                const reminders: { minutesBefore: number }[] = data.reminders ?? []
                const hasStart = reminders.some(r => r.minutesBefore === 0)
                const leadUp = reminders.find(r => r.minutesBefore > 0)
                setReminderEnabled(hasStart)
                setLeadUpEnabled(!!leadUp)
                const mins = leadUp?.minutesBefore ?? 60
                setLeadUpMinutes(mins)
                if (LEAD_UP_PRESETS.includes(mins)) {
                    setLeadUpPreset(mins)
                } else {
                    setLeadUpPreset('custom')
                    if (mins % 1440 === 0) { setCustomAmount(mins / 1440); setCustomUnit('days') }
                    else if (mins % 60 === 0) { setCustomAmount(mins / 60); setCustomUnit('hours') }
                    else { setCustomAmount(mins); setCustomUnit('minutes') }
                }
            })
            .catch(() => {})
            .finally(() => setReminderLoading(false))
    }, [open, event])

    async function handleSubmit() {
        if (!title.trim()) { setError('Title is required'); return }
        setSubmitting(true)
        setError(null)
        try {
            const body: Record<string, unknown> = {
                title: title.trim(),
                department,
                allDay,
            }
            if (description.trim()) body.description = description.trim()

            if (allDay) {
                // Send as date-only — treat as start of day UTC
                body.start = new Date(start.split('T')[0] + 'T00:00:00').toISOString()
                body.end = new Date((end.split('T')[0] || start.split('T')[0]) + 'T23:59:59').toISOString()
            } else {
                body.start = new Date(start).toISOString()
                body.end = new Date(end).toISOString()
            }

            const res = await fetch('/api/admin/calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Failed to create event'); return }
            onSaved()
            handleClose()
        } finally {
            setSubmitting(false)
        }
    }

    async function postReminder(mins: number) {
        if (!event) return
        await fetch('/api/admin/calendar/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event._id, minutesBefore: mins }),
        }).catch(() => {})
    }

    async function deleteReminder(mins?: number) {
        if (!event) return
        const url = mins !== undefined
            ? `/api/admin/calendar/reminders?eventId=${event._id}&minutesBefore=${mins}`
            : `/api/admin/calendar/reminders?eventId=${event._id}`
        await fetch(url, { method: 'DELETE' }).catch(() => {})
    }

    async function handleReminderToggle(enabled: boolean) {
        if (!event) return
        setReminderEnabled(enabled)
        setReminderSaving(true)
        if (enabled) {
            await postReminder(0)
        } else {
            await deleteReminder(0)
        }
        setReminderSaving(false)
    }

    async function handleLeadUpToggle(enabled: boolean) {
        if (!event) return
        setLeadUpEnabled(enabled)
        setReminderSaving(true)
        if (enabled) {
            await postReminder(leadUpMinutes)
        } else {
            await deleteReminder(leadUpMinutes)
        }
        setReminderSaving(false)
    }

    async function handleLeadUpPresetChange(val: number | 'custom') {
        setLeadUpPreset(val)
        if (val === 'custom') return // wait for custom inputs before saving
        const prev = leadUpMinutes
        setLeadUpMinutes(val)
        if (leadUpEnabled) {
            setReminderSaving(true)
            await deleteReminder(prev)
            await postReminder(val)
            setReminderSaving(false)
        }
    }

    async function handleCustomChange(amount: number, unit: 'minutes' | 'hours' | 'days') {
        setCustomAmount(amount)
        setCustomUnit(unit)
        const mins = computeCustomMinutes(amount, unit)
        if (mins <= 0) return
        const prev = leadUpMinutes
        setLeadUpMinutes(mins)
        if (leadUpEnabled) {
            setReminderSaving(true)
            await deleteReminder(prev)
            await postReminder(mins)
            setReminderSaving(false)
        }
    }

    async function handleDelete() {
        if (!event) return
        setDeleting(true)
        setError(null)
        try {
            const res = await fetch(`/api/admin/calendar/${event._id}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Failed to delete event'); return }
            onSaved()
            handleClose()
        } finally {
            setDeleting(false)
        }
    }

    // Reset delete confirming on close
    function handleClose() {
        setDeleteConfirming(false)
        setTitle('')
        setDescription('')
        setStart(defaultStart)
        setEnd(defaultEnd)
        setAllDay(false)
        setDepartment(defaultDepartment ?? 'unit')
        setError(null)
        onClose()
    }

    const canDelete = event && (event.createdById === userId || isJ4)

    const labelStyle = {
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase' as const,
        color: 'rgba(237,237,237,0.35)',
        marginBottom: 2,
    }

    const valueStyle = {
        fontSize: '0.82rem',
        color: 'rgba(237,237,237,0.8)',
    }

    return (
    <>
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 0,
                    border: '1px solid rgba(219,0,29,0.32)',
                    background: 'rgba(14,14,14,0.99)',
                    backgroundImage: 'none',
                },
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(219,0,29,0.42)',
                pb: 1.5,
            }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
                    {isViewMode ? (event?.isOperation ? 'Operation' : 'Event Details') : 'Add Calendar Event'}
                </span>
                <button
                    onClick={handleClose}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', display: 'flex', alignItems: 'center' }}
                >
                    <Close sx={{ fontSize: 18 }} />
                </button>
            </DialogTitle>

            <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {isViewMode && event ? (
                    <>
                        {/* Department badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: DEPT_COLORS[event.department] ?? 'rgba(219,0,29,0.8)',
                                flexShrink: 0,
                            }} />
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DEPT_COLORS[event.department] ?? 'var(--red)' }}>
                                {DEPT_LABELS[event.department] ?? event.department.toUpperCase()}
                            </span>
                        </div>

                        <Typography style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(237,237,237,0.9)', lineHeight: 1.3 }}>
                            {event.title}
                        </Typography>

                        {event.description && (() => {
                            if (event.description!.startsWith('Status: ')) {
                                const label = event.description!.slice(8)
                                const cfg = COURSE_STATUS_STYLE[label]
                                if (cfg) return (
                                    <div>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>Course Status</div>
                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: cfg.color, border: `1px solid ${cfg.border}`, padding: '2px 8px' }}>
                                            {label}
                                        </span>
                                    </div>
                                )
                            }
                            return (
                                <Typography style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', whiteSpace: 'pre-wrap' }}>
                                    {event.description}
                                </Typography>
                            )
                        })()}

                        <Divider sx={{ borderColor: 'rgba(219,0,29,0.12)', my: 0.5 }} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                            <div>
                                <div style={labelStyle}>Date</div>
                                <div style={valueStyle}>{formatDisplay(event.start, false)}</div>
                            </div>
                            {!event.isOperation && (
                                <>
                                    <div>
                                        <div style={labelStyle}>End</div>
                                        <div style={valueStyle}>{formatDisplay(event.end, event.allDay)}</div>
                                    </div>
                                    <div>
                                        <div style={labelStyle}>Created By</div>
                                        <div style={valueStyle}>{event.createdByName}</div>
                                    </div>
                                    <div>
                                        <div style={labelStyle}>Created</div>
                                        <div style={valueStyle}>{formatDisplay(event.createdAt, true)}</div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Reminder */}
                        {!event.isOperation && (
                            <>
                                <Divider sx={{ borderColor: 'rgba(219,0,29,0.12)', my: 0.5 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        {(reminderEnabled || leadUpEnabled)
                                            ? <NotificationsActive sx={{ fontSize: 14, color: 'var(--red)' }} />
                                            : <NotificationsNone sx={{ fontSize: 14, color: 'rgba(237,237,237,0.3)' }} />
                                        }
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                            Reminders
                                        </span>
                                        {reminderSaving && <CircularProgress size={10} sx={{ color: 'var(--red)', ml: 0.5 }} />}
                                    </div>

                                    {/* At start time */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                        <span style={{ fontSize: '0.78rem', color: reminderEnabled ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.4)' }}>
                                            {reminderLoading ? 'Loading…' : 'At start time'}
                                        </span>
                                        <Switch
                                            checked={reminderEnabled}
                                            onChange={e => handleReminderToggle(e.target.checked)}
                                            disabled={reminderLoading || reminderSaving}
                                            size='small'
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                            }}
                                        />
                                    </div>

                                    {/* Beforehand — always visible, independent */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                                        <span style={{ fontSize: '0.78rem', color: leadUpEnabled ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.4)', paddingTop: 6 }}>
                                            Beforehand
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {leadUpEnabled && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                                    <TextField
                                                        select
                                                        size='small'
                                                        value={leadUpPreset}
                                                        onChange={e => handleLeadUpPresetChange(e.target.value === 'custom' ? 'custom' : Number(e.target.value))}
                                                        disabled={reminderSaving}
                                                        sx={{
                                                            minWidth: 150,
                                                            '& .MuiOutlinedInput-root': {
                                                                borderRadius: 0,
                                                                fontSize: '0.78rem',
                                                                '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
                                                                '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
                                                                '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
                                                            },
                                                        }}
                                                    >
                                                        <MenuItem value={15}       sx={{ fontSize: '0.78rem' }}>15 min before</MenuItem>
                                                        <MenuItem value={30}       sx={{ fontSize: '0.78rem' }}>30 min before</MenuItem>
                                                        <MenuItem value={60}       sx={{ fontSize: '0.78rem' }}>1 hour before</MenuItem>
                                                        <MenuItem value={120}      sx={{ fontSize: '0.78rem' }}>2 hours before</MenuItem>
                                                        <MenuItem value={360}      sx={{ fontSize: '0.78rem' }}>6 hours before</MenuItem>
                                                        <MenuItem value={1440}     sx={{ fontSize: '0.78rem' }}>1 day before</MenuItem>
                                                        <MenuItem value='custom'   sx={{ fontSize: '0.78rem' }}>Custom…</MenuItem>
                                                    </TextField>

                                                    {leadUpPreset === 'custom' && (
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <TextField
                                                                size='small'
                                                                type='number'
                                                                value={customAmount}
                                                                onChange={e => handleCustomChange(Math.max(1, Number(e.target.value)), customUnit)}
                                                                inputProps={{ min: 1, style: { fontSize: '0.78rem', width: 56 } }}
                                                                disabled={reminderSaving}
                                                                sx={{
                                                                    '& .MuiOutlinedInput-root': {
                                                                        borderRadius: 0,
                                                                        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
                                                                        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
                                                                        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
                                                                    },
                                                                }}
                                                            />
                                                            <TextField
                                                                select
                                                                size='small'
                                                                value={customUnit}
                                                                onChange={e => handleCustomChange(customAmount, e.target.value as 'minutes' | 'hours' | 'days')}
                                                                disabled={reminderSaving}
                                                                sx={{
                                                                    minWidth: 90,
                                                                    '& .MuiOutlinedInput-root': {
                                                                        borderRadius: 0,
                                                                        fontSize: '0.78rem',
                                                                        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
                                                                        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
                                                                        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
                                                                    },
                                                                }}
                                                            >
                                                                <MenuItem value='minutes' sx={{ fontSize: '0.78rem' }}>min</MenuItem>
                                                                <MenuItem value='hours'   sx={{ fontSize: '0.78rem' }}>hours</MenuItem>
                                                                <MenuItem value='days'    sx={{ fontSize: '0.78rem' }}>days</MenuItem>
                                                            </TextField>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <Switch
                                                checked={leadUpEnabled}
                                                onChange={e => handleLeadUpToggle(e.target.checked)}
                                                disabled={reminderLoading || reminderSaving}
                                                size='small'
                                                sx={{
                                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                                }}
                                            />
                                        </div>
                                    </div>

                                </div>
                            </>
                        )}

                        {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
                    </>
                ) : (
                    <>
                        <TextField
                            label='Title'
                            size='small'
                            required
                            fullWidth
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            sx={inputSx}
                            autoFocus
                        />
                        <TextField
                            label='Description (optional)'
                            size='small'
                            fullWidth
                            multiline
                            rows={2}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            sx={inputSx}
                        />

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={allDay}
                                    onChange={e => setAllDay(e.target.checked)}
                                    size='small'
                                    sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' } }}
                                />
                            }
                            label={<span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)' }}>All Day</span>}
                        />

                        {allDay ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <TextField
                                    label='Start Date'
                                    size='small'
                                    type='date'
                                    value={start.split('T')[0]}
                                    onChange={e => {
                                        const d = e.target.value
                                        setStart(d + 'T00:00')
                                        setEnd(d + 'T23:59')
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    sx={inputSx}
                                />
                                <TextField
                                    label='End Date'
                                    size='small'
                                    type='date'
                                    value={end.split('T')[0]}
                                    onChange={e => setEnd(e.target.value + 'T23:59')}
                                    InputLabelProps={{ shrink: true }}
                                    sx={inputSx}
                                />
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <TextField
                                    label='Start'
                                    size='small'
                                    type='datetime-local'
                                    value={start}
                                    onChange={e => {
                                        const v = e.target.value
                                        setStart(v)
                                        // Always sync end date to start date; preserve existing end time
                                        const existingEndTime = end?.split('T')[1]
                                        if (existingEndTime) {
                                            setEnd(v.split('T')[0] + 'T' + existingEndTime)
                                        } else {
                                            const d = new Date(v)
                                            d.setHours(d.getHours() + 1)
                                            const p = (n: number) => String(n).padStart(2, '0')
                                            setEnd(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`)
                                        }
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    sx={inputSx}
                                />
                                <TextField
                                    label='End'
                                    size='small'
                                    type='datetime-local'
                                    value={end}
                                    onChange={e => setEnd(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={inputSx}
                                />
                            </div>
                        )}

                        {!defaultDepartment && (
                            <TextField
                                label='Department'
                                size='small'
                                select
                                fullWidth
                                value={department}
                                onChange={e => setDepartment(e.target.value)}
                                sx={inputSx}
                            >
                                {Object.entries(DEPT_LABELS).map(([val, label]) => (
                                    <MenuItem key={val} value={val} sx={{ fontSize: '0.82rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DEPT_COLORS[val], flexShrink: 0, display: 'inline-block' }} />
                                            {label}
                                        </span>
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}

                        {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{ borderTop: '1px solid rgba(219,0,29,0.12)', px: 3, py: 1.5, justifyContent: 'space-between' }}>
                {isViewMode && event?.isOperation ? (
                    <Button
                        size='small'
                        component='a'
                        href={`/operations/${event.operationId}`}
                        target='_blank'
                        rel='noreferrer'
                        startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                        sx={{
                            borderRadius: 0,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: '#8b5cf6',
                            '&:hover': { background: 'rgba(139,92,246,0.08)' },
                        }}
                    >
                        Open Operation
                    </Button>
                ) : isViewMode && canDelete ? (
                    <Button
                        size='small'
                        startIcon={<Delete sx={{ fontSize: 14 }} />}
                        onClick={() => setDeleteConfirming(true)}
                        sx={{
                            borderRadius: 0,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: 'rgba(219,0,29,0.7)',
                            '&:hover': { background: 'rgba(219,0,29,0.08)', color: 'var(--red)' },
                        }}
                    >
                        Delete Event
                    </Button>
                ) : <span />}

                <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                        size='small'
                        onClick={handleClose}
                        sx={{
                            borderRadius: 0,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: 'rgba(237,237,237,0.4)',
                            '&:hover': { background: 'rgba(255,255,255,0.04)' },
                        }}
                    >
                        {isViewMode ? 'Close' : 'Cancel'}
                    </Button>
                    {!isViewMode && (
                        <Button
                            variant='outlined'
                            size='small'
                            disabled={submitting || !title.trim()}
                            onClick={handleSubmit}
                            startIcon={submitting ? <CircularProgress size={12} /> : undefined}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                borderColor: 'rgba(219,0,29,0.27)',
                                color: 'var(--red)',
                                '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                '&:disabled': { opacity: 0.4 },
                            }}
                        >
                            {submitting ? 'Saving…' : 'Add Event'}
                        </Button>
                    )}
                </div>
            </DialogActions>
        </Dialog>

        {/* ── Delete confirmation overlay — portaled to body so it sits above the Dialog ── */}
        <Portal>
        {deleteConfirming && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={e => { if (e.target === e.currentTarget) setDeleteConfirming(false) }}
            >
                <div style={{ width: '100%', maxWidth: 420, background: '#0f0f10', border: '1px solid rgba(219,0,29,0.4)', borderTop: '2px solid var(--red)', padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace' }}>
                        {'// CONFIRM DELETE'}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        Delete Training Event
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.65 }}>
                        Are you sure you want to delete <strong style={{ color: 'rgba(237,237,237,0.85)' }}>{event?.title}</strong>?
                        This action cannot be undone.
                    </div>
                    {error && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', padding: '8px 10px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)' }}>{error}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDeleteConfirming(false)}
                            style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                        >CANCEL</button>
                        <button onClick={async () => {
                            await handleDelete()
                            setDeleteConfirming(false)
                        }} disabled={deleting}
                            style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}
                        >{deleting ? 'DELETING…' : 'DELETE EVENT'}</button>
                    </div>
                </div>
            </div>
        )}
        </Portal>
    </>
    )
}
