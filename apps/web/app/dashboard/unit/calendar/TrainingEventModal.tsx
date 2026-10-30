'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, ListSubheader,
    CircularProgress, Alert, IconButton,
} from '@mui/material'
import { Close, Add, Remove } from '@mui/icons-material'
import { groupByCategory } from '@/lib/training/categories'
import { sessionTemplateFor, type SessionTemplateItem } from '@/lib/training/course-sessions'
import CourseSessionsEditor, { rowsFromTemplate, rowsToPlan, type SessionRow } from './CourseSessionsEditor'
import { defaultReminderOffsets, formatOffset, sanitiseOffsets, suggestedEnd, LOAD_IN_NOTE, LOAD_IN_OFFSET } from '@/lib/training/reminder-offsets'

/**
 * The J3 Training Calendar's Add Event (row 213).
 *
 * Not a second way to make training: it is a front end on the two that exist.
 * A normal course becomes a `TrainingEvent` through `POST /api/training/events`
 * (approved on save for a J3 lead, pending for anyone else, exactly as the
 * Training Requests tab does it), which is what puts it on the calendar in J3's
 * green. Selection and Reinforcement Cycle are not training events at all —
 * they are course instances with six sessions — so picking one creates the
 * instance through `POST /api/j3/course-instances` with this date as Session 1.
 */

interface TypeRow {
    _id: string
    name: string
    category: string
    status: 'active' | 'wip' | 'inactive'
    durationMinutes?: number
    description?: string
    courseType?: 'selection' | 'reinforcement_cycle'
    sessionTemplate?: SessionTemplateItem[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toTimeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Offsets the reminder picker offers, in minutes. */
const OFFSET_CHOICES = [15, 30, 60, 120, 360, 1440, 2 * 1440, 3 * 1440, 10080, 2 * 10080, 43200]

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

const labelStyle: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)',
}

export default function TrainingEventModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
    const [types, setTypes] = useState<TypeRow[] | null>(null)
    const [typeId, setTypeId] = useState('')
    const [date, setDate] = useState(() => toDateValue(new Date()))
    const [startTime, setStartTime] = useState('19:00')
    const [endTime, setEndTime] = useState('20:00')
    /** Set once the creator types an end time; until then it follows course + start. */
    const [endEdited, setEndEdited] = useState(false)
    const [description, setDescription] = useState('')
    const [offsets, setOffsets] = useState<number[]>(defaultReminderOffsets())
    /** Selection / Reinforcement Cycle: one row per session. */
    const [sessions, setSessions] = useState<SessionRow[]>([])
    const [addOffset, setAddOffset] = useState<number | ''>('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open || types) return
        fetch('/api/training/types')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setTypes((d.types ?? []) as TypeRow[]))
            .catch(() => setError('Could not load the Training Hub courses.'))
    }, [open, types])

    // Every course the Training Hub lists; work-in-progress and inactive ones are labelled.
    const courses = useMemo(() => types ?? [], [types])
    const groups = useMemo(() => groupByCategory(courses), [courses])
    const selected = courses.find(t => t._id === typeId)
    const isCourse = !!selected?.courseType

    function recalcEnd(nextType: TypeRow | undefined, nextDate: string, nextStart: string) {
        if (endEdited || !nextType) return
        const start = new Date(`${nextDate}T${nextStart}`)
        if (!isNaN(start.getTime())) setEndTime(toTimeValue(suggestedEnd(start, nextType.durationMinutes)))
    }

    function pickType(id: string) {
        setTypeId(id)
        const t = courses.find(x => x._id === id)
        setOffsets(defaultReminderOffsets(t?.courseType))
        setSessions(t?.courseType ? rowsFromTemplate(sessionTemplateFor(t), date, startTime) : [])
        if (t?.description && !description) setDescription(t.description)
        recalcEnd(t, date, startTime)
    }

    function reset() {
        setTypeId(''); setDescription(''); setEndEdited(false); setError(null); setSessions([])
        setOffsets(defaultReminderOffsets()); setAddOffset('')
    }

    function close() { reset(); onClose() }

    async function save() {
        if (!selected) return
        const course = isCourse ? rowsToPlan(sessions) : null
        if (course?.error) { setError(course.error); return }
        const start = new Date(`${date}T${startTime}`)
        let end = new Date(`${date}T${endTime}`)
        if (!isCourse && (isNaN(start.getTime()) || isNaN(end.getTime()))) { setError('Set a date, start and end time.'); return }
        // An end earlier than the start is the next morning, not a mistake.
        if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000)

        setSaving(true); setError(null)
        try {
            const res = isCourse
                ? await fetch('/api/j3/course-instances', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trainingTypeId: selected._id, sessions: course!.plan, reminderOffsets: offsets }),
                })
                : await fetch('/api/training/events', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        trainingTypeId: selected._id,
                        title: selected.name,
                        description: description.trim() || undefined,
                        scheduledAt: start.toISOString(),
                        endsAt: end.toISOString(),
                        reminderOffsets: offsets,
                        approveNow: true,
                    }),
                })
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(res.status === 403
                    ? (isCourse ? 'Only J3 leads can schedule a Selection or Reinforcement Cycle.' : 'You do not have permission to schedule training.')
                    : d.error ?? 'Saving failed.')
                return
            }
            reset()
            onSaved()
            onClose()
        } catch {
            setError('Saving failed.')
        } finally {
            setSaving(false)
        }
    }

    const offsetChoices = OFFSET_CHOICES.filter(o => !offsets.includes(o))

    return (
        <Dialog open={open} onClose={close} maxWidth='sm' fullWidth
            PaperProps={{ sx: { borderRadius: 0, border: '1px solid rgba(219,0,29,0.32)', background: 'rgba(14,14,14,0.99)', backgroundImage: 'none' } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-2)', pb: 1.5 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>Add Training Event</span>
                <IconButton size='small' onClick={close} aria-label='Close' sx={{ color: 'rgba(237,237,237,0.4)' }}><Close sx={{ fontSize: 16 }} /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '20px !important' }}>
                <TextField label='Training' size='small' select fullWidth value={typeId} onChange={e => pickType(e.target.value)} sx={inputSx}
                    disabled={!types}
                    SelectProps={{ renderValue: v => courses.find(t => t._id === v)?.name ?? '' }}
                    helperText={types && courses.length === 0
                        ? 'No courses in the Training Hub.'
                        : selected?.durationMinutes ? `Runtime: ${formatOffset(selected.durationMinutes)}` : undefined}
                >
                    {groups.flatMap(g => [
                        <ListSubheader key={`h-${g.category}`} sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: '28px', background: '#141414', color: 'var(--live)' }}>
                            {g.category}
                        </ListSubheader>,
                        ...g.items.map(t => (
                            <MenuItem key={t._id} value={t._id} sx={{ fontSize: '0.82rem', pl: 3 }}>
                                {t.name}
                                {t.status !== 'active' && <span style={{ marginLeft: 8, fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{t.status === 'wip' ? 'WIP' : 'Inactive'}</span>}
                                {t.durationMinutes ? <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', paddingLeft: 16 }}>{formatOffset(t.durationMinutes)}</span> : null}
                            </MenuItem>
                        )),
                    ])}
                </TextField>

                {isCourse ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span style={labelStyle}>Sessions</span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                            Creates the next numbered {selected?.name} run. Rename or remove sessions for this run; the defaults are set on the course in the Training Hub.
                        </span>
                        <CourseSessionsEditor rows={sessions} onChange={setSessions}
                            onResuggest={() => selected && sessions[0] && setSessions(rowsFromTemplate(
                                sessions.map(r => ({ name: r.name, durationMinutes: r.durationMinutes })), sessions[0].date, sessions[0].time,
                            ))} />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                        <TextField label='Date' size='small' type='date' value={date}
                            onChange={e => { setDate(e.target.value); recalcEnd(selected, e.target.value, startTime) }}
                            InputLabelProps={{ shrink: true }} sx={inputSx} />
                        <TextField label='Start' size='small' type='time' value={startTime}
                            onChange={e => { setStartTime(e.target.value); recalcEnd(selected, date, e.target.value) }}
                            InputLabelProps={{ shrink: true }} sx={inputSx} />
                        <TextField label='End' size='small' type='time' value={endTime}
                            onChange={e => { setEndTime(e.target.value); setEndEdited(true) }}
                            helperText={endEdited ? undefined : 'From the course length'}
                            InputLabelProps={{ shrink: true }} sx={inputSx} />
                    </div>
                )}

                {!isCourse && (
                    <TextField label='Description (optional)' size='small' fullWidth multiline minRows={2} value={description}
                        onChange={e => setDescription(e.target.value)} sx={inputSx} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={labelStyle}>{isCourse ? 'Reminders before Session 1' : 'Reminders'}</span>
                    {offsets.length === 0 && <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.35)' }}>No reminders.</span>}
                    {offsets.map(o => (
                        <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'rgba(237,237,237,0.8)' }}>
                            <span>{formatOffset(o)} before</span>
                            {o === LOAD_IN_OFFSET && <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)' }}>"{LOAD_IN_NOTE}"</span>}
                            <IconButton size='small' aria-label={`Remove ${formatOffset(o)} reminder`} onClick={() => setOffsets(offsets.filter(x => x !== o))} sx={{ ml: 'auto', color: 'rgba(237,237,237,0.4)' }}>
                                <Remove sx={{ fontSize: 14 }} />
                            </IconButton>
                        </div>
                    ))}
                    {offsets.length < 5 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <TextField select size='small' label='Add reminder' value={addOffset} onChange={e => setAddOffset(Number(e.target.value))} sx={{ ...inputSx, minWidth: 180 }}>
                                {offsetChoices.map(o => <MenuItem key={o} value={o} sx={{ fontSize: '0.82rem' }}>{formatOffset(o)} before</MenuItem>)}
                            </TextField>
                            <IconButton size='small' aria-label='Add reminder' disabled={addOffset === ''}
                                onClick={() => { if (addOffset !== '') { setOffsets(sanitiseOffsets([...offsets, addOffset]) ?? offsets); setAddOffset('') } }}
                                sx={{ color: 'var(--red)' }}>
                                <Add sx={{ fontSize: 16 }} />
                            </IconButton>
                        </div>
                    )}
                    <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>
                        {isCourse ? 'Sent to the candidates enrolled on the course.' : 'Sent to everyone signed up for the session.'}
                    </span>
                </div>

                {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
            </DialogContent>

            <DialogActions sx={{ borderTop: '1px solid var(--line-2)', px: 3, py: 1.5 }}>
                <Button size='small' onClick={close} sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                <Button variant='outlined' size='small' disabled={saving || !selected} onClick={save}
                    startIcon={saving ? <CircularProgress size={12} /> : undefined}
                    sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' }, '&:disabled': { opacity: 0.4 } }}
                >
                    {saving ? 'Saving…' : 'Add Event'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
