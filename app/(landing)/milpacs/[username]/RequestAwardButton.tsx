'use client'

import { useState, useMemo } from 'react'
import { AWARDS } from '@/lib/awards'

const AWARD_TYPE_ORDER = [
    'Non-Operational Award',
    'Service Citation',
    'Operational Service Citation',
    'Period of Service Citation',
]

export function RequestAwardButton({
    targetUserId,
    targetUserName,
    existingAwardNames,
    accent,
}: {
    targetUserId: string
    targetUserName: string
    existingAwardNames: string[]
    accent: string
}) {
    const [open, setOpen] = useState(false)
    const [awardName, setAwardName] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const availableAwards = useMemo(() => {
        const existing = new Set(existingAwardNames)
        return AWARDS.filter(a => !existing.has(a.label))
    }, [existingAwardNames])

    const groupedAwards = useMemo(() => {
        const groups = new Map<string, typeof AWARDS[number][]>()
        for (const a of availableAwards) {
            if (!groups.has(a.type)) groups.set(a.type, [])
            groups.get(a.type)!.push(a)
        }
        // Order groups by AWARD_TYPE_ORDER, then any remaining
        const ordered: { type: string; awards: typeof AWARDS[number][] }[] = []
        for (const t of AWARD_TYPE_ORDER) {
            if (groups.has(t)) ordered.push({ type: t, awards: groups.get(t)! })
        }
        for (const [t, awards] of groups) {
            if (!AWARD_TYPE_ORDER.includes(t)) ordered.push({ type: t, awards })
        }
        return ordered
    }, [availableAwards])

    function handleClose() {
        setOpen(false)
        setAwardName('')
        setNotes('')
        setError(null)
    }

    async function handleSubmit() {
        if (!awardName) return
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch('/api/award-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ awardName, targetUserId, targetUserName, notes }),
            })
            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Failed to submit request')
                return
            }
            setSuccess(true)
            setTimeout(() => {
                setSuccess(false)
                handleClose()
            }, 3000)
        } catch {
            setError('Failed to submit request')
        } finally {
            setSubmitting(false)
        }
    }

    const btnBase: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        padding: '5px 12px',
        border: `1px solid ${accent}40`,
        background: `${accent}0d`,
        color: `${accent}cc`,
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
    }

    const inputStyle: React.CSSProperties = {
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.9)',
        padding: '8px 10px',
        fontSize: '0.82rem',
        outline: 'none',
        width: '100%',
        fontFamily: 'inherit',
        colorScheme: 'dark',
    }

    const labelStyle: React.CSSProperties = {
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: 'rgba(237,237,237,0.3)',
        marginBottom: 6,
        display: 'block',
    }

    return (
        <>
            <button style={btnBase} onClick={() => setOpen(true)}>
                Nominate Award
            </button>

            {open && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div style={{
                        background: '#141414',
                        border: `1px solid ${accent}30`,
                        borderTop: `2px solid ${accent}`,
                        width: '100%',
                        maxWidth: 480,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: `1px solid ${accent}20`,
                        }}>
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: `${accent}aa`, marginBottom: 2 }}>
                                    Award Nomination
                                </div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                                    {targetUserName}
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1.2rem', padding: 4, lineHeight: 1, fontFamily: 'inherit' }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={labelStyle}>Award</label>
                                <select
                                    value={awardName}
                                    onChange={e => setAwardName(e.target.value)}
                                    style={{ ...inputStyle, cursor: 'pointer' }}
                                >
                                    <option value=''>— Select Award —</option>
                                    {groupedAwards.map(group => (
                                        <optgroup key={group.type} label={group.type}>
                                            {group.awards.map(a => (
                                                <option key={a.label} value={a.label}>{a.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                {availableAwards.length === 0 && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', marginTop: 6 }}>
                                        This member already holds all available awards.
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={labelStyle}>Reason / Notes (optional)</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={3}
                                    placeholder='Briefly describe the reason for this nomination…'
                                    style={{ ...inputStyle, resize: 'vertical' }}
                                />
                            </div>

                            {error && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--red)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', padding: '8px 12px' }}>
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div style={{ fontSize: '0.78rem', color: 'rgb(0,195,100)', background: 'rgba(0,195,100,0.08)', border: '1px solid rgba(0,195,100,0.2)', padding: '8px 12px' }}>
                                    Award request submitted successfully.
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={handleClose}
                                    style={{ ...btnBase, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!awardName || submitting || success || availableAwards.length === 0}
                                    style={{
                                        ...btnBase,
                                        opacity: (!awardName || submitting || success || availableAwards.length === 0) ? 0.4 : 1,
                                        cursor: (!awardName || submitting || success || availableAwards.length === 0) ? 'default' : 'pointer',
                                    }}
                                >
                                    {submitting ? 'Submitting…' : 'Submit Nomination'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
