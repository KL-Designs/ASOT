'use client'

import { IconButton, TextField } from '@mui/material'
import { Close } from '@mui/icons-material'
import { MAX_SESSIONS, suggestedSessionDates, type SessionTemplateItem } from '@/lib/training/course-sessions'

/**
 * The sessions of a Selection or Reinforcement Cycle run, each under its own
 * "Session N" heading with a name, date and start time. Sessions can be
 * renamed or removed for this run, and catch-ups added as required; the
 * defaults come from the course in the Training Hub.
 */

export interface SessionRow {
    name: string
    date: string
    time: string
    durationMinutes?: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Rows for a course's sessions, dated on from Session 1. */
export function rowsFromTemplate(template: SessionTemplateItem[], date: string, time: string): SessionRow[] {
    const s1 = new Date(`${date}T${time || '19:00'}`)
    if (isNaN(s1.getTime())) return template.map(t => ({ name: t.name, date: '', time, durationMinutes: t.durationMinutes }))
    return suggestedSessionDates(s1, template.length).map((d, i) => ({ name: template[i].name, date: dateValue(d), time: timeValue(d), durationMinutes: template[i].durationMinutes }))
}

/** What the course-instances route takes, or an error to show. */
export function rowsToPlan(rows: SessionRow[]): { plan?: { name: string; start: string; durationMinutes?: number }[]; error?: string } {
    if (!rows.length) return { error: 'Add at least one session.' }
    const plan = []
    for (const [i, r] of rows.entries()) {
        const start = new Date(`${r.date}T${r.time}`)
        if (isNaN(start.getTime())) return { error: `Set a date and time for Session ${i + 1}.` }
        plan.push({ name: r.name, start: start.toISOString(), ...(r.durationMinutes ? { durationMinutes: r.durationMinutes } : {}) })
    }
    return { plan }
}

const inputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.8rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } },
    '& .MuiInputLabel-root': { fontSize: '0.78rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

export default function CourseSessionsEditor({ rows, onChange, onResuggest }: {
    rows: SessionRow[]
    onChange: (rows: SessionRow[]) => void
    /** Re-date every session from Session 1's date and time. */
    onResuggest?: () => void
}) {
    const set = (i: number, patch: Partial<SessionRow>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--live)', flexShrink: 0 }}>Session {i + 1}</span>
                        <TextField size='small' placeholder='Name (optional)' value={r.name} onChange={e => set(i, { name: e.target.value })} sx={{ ...inputSx, flex: 1 }} inputProps={{ maxLength: 80 }} />
                        <IconButton size='small' aria-label={`Remove session ${i + 1}`} disabled={rows.length === 1}
                            onClick={() => onChange(rows.filter((_, j) => j !== i))} sx={{ color: 'rgba(237,237,237,0.4)' }}>
                            <Close sx={{ fontSize: 15 }} />
                        </IconButton>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <TextField size='small' type='date' value={r.date} onChange={e => set(i, { date: e.target.value })} sx={{ ...inputSx, flex: 1 }} InputLabelProps={{ shrink: true }} />
                        <TextField size='small' type='time' value={r.time} onChange={e => set(i, { time: e.target.value })} sx={{ ...inputSx, width: 120 }} InputLabelProps={{ shrink: true }} />
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 14 }}>
                {rows.length < MAX_SESSIONS && (
                    <button type='button' onClick={() => {
                        const last = rows[rows.length - 1]
                        onChange([...rows, { name: 'Catch-up', date: last?.date ?? '', time: last?.time ?? '19:00', durationMinutes: last?.durationMinutes }])
                    }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(219,0,29,0.85)' }}>
                        + Add session
                    </button>
                )}
                {onResuggest && rows.length > 1 && (
                    <button type='button' onClick={onResuggest}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>
                        Re-date from Session 1
                    </button>
                )}
            </div>
        </div>
    )
}
