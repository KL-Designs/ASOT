'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Close } from '@mui/icons-material'

interface Props {
    department: MeetingDepartment
    onClose: () => void
    onCreate: (meeting: Meeting) => void
}

export default function CreateMeetingModal({ department, onClose, onCreate }: Props) {
    const [title, setTitle] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 16))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function submit() {
        if (!title.trim()) { setError('Title is required'); return }
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department, title: title.trim(), date }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed to create'); return }

            // Fetch the created meeting to get the full object
            const fresh = await fetch(`/api/admin/meetings/${data.id}`).then(r => r.json())
            if (fresh.meeting) onCreate(fresh.meeting)
        } finally { setSaving(false) }
    }

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 440, background: 'rgb(13,13,13)', border: '1px solid rgba(219,0,29,0.32)', borderTop: '2px solid var(--red)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace' }}>
                        // New Meeting
                    </span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.4)' }}>
                        <Close sx={{ fontSize: 16 }} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                            Title
                        </label>
                        <input
                            autoFocus
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submit() }}
                            placeholder='Meeting title…'
                            style={{
                                all: 'unset', display: 'block', width: '100%',
                                fontSize: '0.82rem', color: 'var(--foreground)',
                                background: 'rgba(255,255,255,0.04)', padding: '7px 10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                            Date &amp; Time
                        </label>
                        <input
                            type='datetime-local'
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            style={{
                                all: 'unset', display: 'block', width: '100%',
                                fontSize: '0.78rem', color: 'var(--foreground)',
                                background: 'rgba(255,255,255,0.04)', padding: '7px 10px',
                                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                            }}
                        />
                    </div>
                </div>

                {error && <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            all: 'unset', cursor: 'pointer', padding: '6px 14px',
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                            color: 'rgba(237,237,237,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        style={{
                            all: 'unset', cursor: 'pointer', padding: '6px 16px',
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                            background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.45)',
                            color: 'rgba(219,0,29,0.9)', display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        {saving ? <CircularProgress size={12} color='inherit' /> : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    )
}
