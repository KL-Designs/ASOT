'use client'

import { useEffect, useState } from 'react'
import BCT_QUIZ from '@/lib/quiz-data'

const RED = '#db001d'

interface Recruit {
    id: string
    displayName: string
}

interface Props {
    onClose: () => void
    onAssigned: () => void
}

export default function AssignQuizModal({ onClose, onAssigned }: Props) {
    const [recruits, setRecruits] = useState<Recruit[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(BCT_QUIZ.timeLimitMinutes)
    const [timerModifiedReason, setTimerModifiedReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const timerModified = timeLimitMinutes !== BCT_QUIZ.timeLimitMinutes

    useEffect(() => {
        fetch('/api/admin/quiz/recruits')
            .then(r => r.json())
            .then(data => setRecruits(data.recruits ?? []))
            .catch(() => setRecruits([]))
            .finally(() => setLoading(false))
    }, [])

    const selectedRecruit = recruits.find(r => r.id === selectedId)

    async function handleAssign() {
        if (!selectedId || !selectedRecruit) return
        if (timerModified && !timerModifiedReason.trim()) {
            setError('You must provide a reason for modifying the timer.')
            return
        }
        setError(null)
        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/quiz/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedId,
                    userName: selectedRecruit.displayName,
                    timeLimitMinutes,
                    timerModifiedReason: timerModified ? timerModifiedReason.trim() : undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Failed to assign quiz.')
            } else {
                onAssigned()
                onClose()
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
            <div style={{
                maxWidth: 500, width: '100%',
                border: `1px solid rgba(219,0,29,0.35)`,
                borderTop: `2px solid ${RED}`,
                background: 'rgba(10,10,10,0.97)',
                position: 'relative',
            }}>
                {/* Corner ticks */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 14, height: 1, background: 'rgba(219,0,29,0.35)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 14, background: 'rgba(219,0,29,0.35)' }} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 1, background: 'rgba(219,0,29,0.35)' }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 14, background: 'rgba(219,0,29,0.35)' }} />
                </div>

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(0,0,0,0.4)',
                }}>
                    <div>
                        <div style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace', marginBottom: 4 }}>
                            {'// J3 TRAINING'}
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                            Assign BCT Quiz
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ all: 'unset', cursor: 'pointer', fontSize: '1rem', color: 'rgba(237,237,237,0.35)', padding: '2px 6px' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>

                    {/* Recruit selector */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', marginBottom: 6 }}>
                            Select Recruit
                        </label>
                        {loading ? (
                            <div style={{ padding: '10px 0', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>Loading recruits…</div>
                        ) : recruits.length === 0 ? (
                            <div style={{ padding: '10px 0', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>No recruits found.</div>
                        ) : (
                            <select
                                value={selectedId ?? ''}
                                onChange={e => setSelectedId(e.target.value || null)}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: '#0d0d0d',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem',
                                    padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
                                    colorScheme: 'dark',
                                }}
                            >
                                <option value='' style={{ background: '#0d0d0d', color: 'rgba(237,237,237,0.85)' }}>— Choose a recruit —</option>
                                {recruits.map(r => (
                                    <option key={r.id} value={r.id} style={{ background: '#0d0d0d', color: 'rgba(237,237,237,0.85)' }}>{r.displayName}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Timer */}
                    <div style={{ marginBottom: timerModified ? 12 : 0 }}>
                        <label style={{ display: 'block', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', marginBottom: 6 }}>
                            Time Limit (minutes) <span style={{ color: 'rgba(237,237,237,0.2)' }}>default: {BCT_QUIZ.timeLimitMinutes}</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                                type='number'
                                min={1}
                                max={60}
                                value={timeLimitMinutes}
                                onChange={e => setTimeLimitMinutes(Math.max(1, parseInt(e.target.value) || BCT_QUIZ.timeLimitMinutes))}
                                style={{
                                    width: 80,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: timerModified ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.12)',
                                    color: timerModified ? 'rgba(245,158,11,0.9)' : 'rgba(237,237,237,0.85)',
                                    fontSize: '0.85rem', padding: '7px 10px', outline: 'none', fontFamily: 'monospace',
                                }}
                            />
                            {timerModified && (
                                <span style={{ fontSize: '0.6rem', color: 'rgba(245,158,11,0.75)', fontWeight: 700 }}>
                                    Modified — J3 Leads will be notified
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Timer modification reason */}
                    {timerModified && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,158,11,0.6)', fontFamily: 'monospace', marginBottom: 6 }}>
                                Reason for Timer Change (required)
                            </label>
                            <textarea
                                value={timerModifiedReason}
                                onChange={e => setTimerModifiedReason(e.target.value)}
                                rows={2}
                                placeholder="Why are you adjusting the time limit?"
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem', lineHeight: 1.5,
                                    padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.68rem', color: 'rgba(239,68,68,0.9)' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            onClick={onClose}
                            style={{
                                all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                                padding: '9px 0', border: '1px solid rgba(255,255,255,0.12)',
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.5)',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAssign}
                            disabled={!selectedId || submitting}
                            style={{
                                all: 'unset',
                                cursor: !selectedId || submitting ? 'default' : 'pointer',
                                flex: 2, textAlign: 'center',
                                padding: '9px 0',
                                background: !selectedId ? 'rgba(219,0,29,0.3)' : RED,
                                border: `1px solid ${RED}`,
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: '#fff', opacity: submitting ? 0.7 : 1,
                            }}
                        >
                            {submitting ? 'Assigning…' : 'Assign Quiz'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
