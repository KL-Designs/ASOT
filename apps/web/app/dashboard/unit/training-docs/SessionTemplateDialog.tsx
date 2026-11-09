'use client'

import { useState } from 'react'
import { IconButton, TextField } from '@mui/material'
import { ArrowDownward, ArrowUpward, Close } from '@mui/icons-material'
import { DEFAULT_SESSION_TEMPLATES, MAX_SESSIONS, sessionTemplateFor, type SessionTemplateItem } from '@/lib/training/course-sessions'

/**
 * Training Hub → a Selection or Reinforcement Cycle course → Sessions. The
 * default session names and runtimes each new run starts from; a run can still
 * rename or drop sessions when it is scheduled.
 */
export default function SessionTemplateDialog({ type, onClose, onSaved }: {
    type: { _id: string; name: string; courseType?: string; durationMinutes?: number; sessionTemplate?: SessionTemplateItem[] }
    onClose: () => void
    onSaved: (template: SessionTemplateItem[] | null) => void
}) {
    const [rows, setRows] = useState<SessionTemplateItem[]>(() => sessionTemplateFor(type))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const set = (i: number, patch: Partial<SessionTemplateItem>) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
    const move = (i: number, by: number) => {
        const next = [...rows]
        const [r] = next.splice(i, 1)
        next.splice(i + by, 0, r)
        setRows(next)
    }

    async function save(template: SessionTemplateItem[] | null) {
        setSaving(true); setError(null)
        try {
            const res = await fetch(`/api/training/types/${type._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionTemplate: template }) })
            if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Saving failed.'); return }
            onSaved(template)
        } finally {
            setSaving(false)
        }
    }

    const input: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.9)', fontSize: '0.78rem', padding: '6px 8px', outline: 'none' }
    const kind = type.courseType === 'reinforcement_cycle' ? 'reinforcement_cycle' : 'selection'

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
            <div style={{ background: '#0e0e0e', border: '1px solid var(--line-2)', borderTop: '3px solid #db001d', padding: 24, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6 }}>{'//'} SESSIONS</div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{type.name}</h3>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', marginTop: 6, lineHeight: 1.5 }}>
                        The sessions each new run starts with. Runtime is in minutes; blank uses the course&apos;s {type.durationMinutes ? `${type.durationMinutes} minutes` : 'default'}.
                    </div>
                </div>
                {rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--live)', width: 74, flexShrink: 0 }}>Session {i + 1}</span>
                        <input style={{ ...input, flex: 1 }} placeholder='Name (optional)' value={r.name} maxLength={80} onChange={e => set(i, { name: e.target.value })} />
                        <TextField size='small' type='number' placeholder='min' value={r.durationMinutes ?? ''} onChange={e => set(i, { durationMinutes: e.target.value ? Number(e.target.value) : undefined })}
                            sx={{ width: 84, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.78rem' } }} inputProps={{ min: 15, max: 1440 }} />
                        <IconButton size='small' disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpward sx={{ fontSize: 14 }} /></IconButton>
                        <IconButton size='small' disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDownward sx={{ fontSize: 14 }} /></IconButton>
                        <IconButton size='small' disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Close sx={{ fontSize: 14 }} /></IconButton>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 14 }}>
                    {rows.length < MAX_SESSIONS && (
                        <button type='button' onClick={() => setRows([...rows, { name: '' }])} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(219,0,29,0.85)' }}>+ Add session</button>
                    )}
                    <button type='button' onClick={() => setRows(DEFAULT_SESSION_TEMPLATES[kind].map(s => ({ ...s })))} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>Reset to defaults</button>
                </div>
                {error && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type='button' onClick={onClose} disabled={saving}
                        style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
                    <button type='button' onClick={() => save(rows)} disabled={saving}
                        style={{ padding: '8px 20px', background: '#db001d', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    )
}
