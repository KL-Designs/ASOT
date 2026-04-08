'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, FormControlLabel, Switch,
    CircularProgress, Alert, Typography, Divider,
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
    const [error, setError] = useState<string | null>(null)

    // Reminder state (view mode only)
    const [reminderEnabled, setReminderEnabled] = useState(false)
    const [leadUpEnabled, setLeadUpEnabled] = useState(false)
    const [leadUpMinutes, setLeadUpMinutes] = useState(60)
    const [reminderLoading, setReminderLoading] = useState(false)
    const [reminderSaving, setReminderSaving] = useState(false)

    useEffect(() => {
        if (!open || !event) return
        setReminderLoading(true)
        fetch(`/api/admin/calendar/reminders?eventId=${event._id}`)
            .then(r => r.json())
            .then(data => {
                const reminders: { minutesBefore: number }[] = data.reminders ?? []
                const hasStart = reminders.some(r => r.minutesBefore === 0)
                const leadUp = reminders.find(r => r.minutesBefore > 0)
                setReminderEnabled(hasStart || !!leadUp)
                setLeadUpEnabled(!!leadUp)
                setLeadUpMinutes(leadUp?.minutesBefore ?? 60)
            })
            .catch(() => {})
            .finally(() => setReminderLoading(false))
    }, [open, event])

    function handleClose() {
        setTitle('')
        setDescription('')
        setStart(defaultStart)
        setEnd(defaultEnd)
        setAllDay(false)
        setDepartment(defaultDepartment ?? 'unit')
        setError(null)
        onClose()
    }

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
            if (leadUpEnabled) await postReminder(leadUpMinutes)
        } else {
            setLeadUpEnabled(false)
            await deleteReminder()
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

    async function handleLeadUpMinutesChange(mins: number) {
        if (!event) return
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

                        {event.description && (
                            <Typography style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', whiteSpace: 'pre-wrap' }}>
                                {event.description}
                            </Typography>
                        )}

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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                                    {/* Main toggle — at start time */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {reminderEnabled
                                                ? <NotificationsActive sx={{ fontSize: 16, color: 'var(--red)' }} />
                                                : <NotificationsNone sx={{ fontSize: 16, color: 'rgba(237,237,237,0.3)' }} />
                                            }
                                            <span style={{ fontSize: '0.78rem', color: reminderEnabled ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.4)' }}>
                                                {reminderLoading ? 'Loading…' : 'Remind me at start time'}
                                            </span>
                                            {reminderSaving && <CircularProgress size={10} sx={{ color: 'var(--red)', ml: 0.5 }} />}
                                        </div>
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

                                    {/* Lead-up toggle — only visible when main is on */}
                                    {reminderEnabled && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 24 }}>
                                            <span style={{ fontSize: '0.75rem', color: leadUpEnabled ? 'rgba(237,237,237,0.7)' : 'rgba(237,237,237,0.35)' }}>
                                                Also remind me beforehand
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {leadUpEnabled && (
                                                    <TextField
                                                        select
                                                        size='small'
                                                        value={leadUpMinutes}
                                                        onChange={e => handleLeadUpMinutesChange(Number(e.target.value))}
                                                        disabled={reminderSaving}
                                                        sx={{
                                                            minWidth: 140,
                                                            '& .MuiOutlinedInput-root': {
                                                                borderRadius: 0,
                                                                fontSize: '0.78rem',
                                                                '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
                                                                '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
                                                                '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
                                                            },
                                                        }}
                                                    >
                                                        <MenuItem value={15} sx={{ fontSize: '0.78rem' }}>15 min before</MenuItem>
                                                        <MenuItem value={30} sx={{ fontSize: '0.78rem' }}>30 min before</MenuItem>
                                                        <MenuItem value={60} sx={{ fontSize: '0.78rem' }}>1 hour before</MenuItem>
                                                        <MenuItem value={120} sx={{ fontSize: '0.78rem' }}>2 hours before</MenuItem>
                                                        <MenuItem value={360} sx={{ fontSize: '0.78rem' }}>6 hours before</MenuItem>
                                                        <MenuItem value={1440} sx={{ fontSize: '0.78rem' }}>1 day before</MenuItem>
                                                    </TextField>
                                                )}
                                                <Switch
                                                    checked={leadUpEnabled}
                                                    onChange={e => handleLeadUpToggle(e.target.checked)}
                                                    disabled={reminderSaving}
                                                    size='small'
                                                    sx={{
                                                        '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
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
                                    onChange={e => setStart(e.target.value + 'T00:00')}
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
                                    onChange={e => setStart(e.target.value)}
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
                        startIcon={deleting ? <CircularProgress size={12} /> : <Delete sx={{ fontSize: 14 }} />}
                        disabled={deleting}
                        onClick={handleDelete}
                        sx={{
                            borderRadius: 0,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: 'rgba(219,0,29,0.7)',
                            '&:hover': { background: 'rgba(219,0,29,0.08)', color: 'var(--red)' },
                        }}
                    >
                        {deleting ? 'Deleting…' : 'Delete Event'}
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
    )
}
