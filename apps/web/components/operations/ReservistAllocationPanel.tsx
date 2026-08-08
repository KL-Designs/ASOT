'use client'

import { useState, useMemo, useCallback } from 'react'
import { Box, Typography, Avatar, CircularProgress, Collapse } from '@mui/material'
import { CheckCircle, Cancel, HelpOutline, ExpandMore, ExpandLess, Person } from '@mui/icons-material'

interface AttendanceRecord {
    userId: string
    unit: string
    orbatSection: string
    orbatRole: string
    rsvp: 'attending' | 'not_attending' | null
    reservistSection?: string
    category?: string
    user: {
        id: string
        displayName: string
        avatarURL: string
        isSkeletonAccount?: boolean
    } | null
}

interface Props {
    operationId: string
    records: AttendanceRecord[]
    themeColor: string
    onSaved: () => void
}

const RESERVIST_CATS = new Set(['activeReservist', 'inactiveReservist'])

function rsvpBadge(rsvp: 'attending' | 'not_attending' | null) {
    if (rsvp === 'attending')     return <CheckCircle sx={{ fontSize: 13, color: '#4caf50', flexShrink: 0 }} />
    if (rsvp === 'not_attending') return <Cancel      sx={{ fontSize: 13, color: 'rgba(219,0,29,0.7)', flexShrink: 0 }} />
    return <HelpOutline sx={{ fontSize: 13, color: 'rgba(237,237,237,0.2)', flexShrink: 0 }} />
}

export default function ReservistAllocationPanel({ operationId, records, themeColor, onSaved }: Props) {
    const [saving, setSaving]   = useState(false)
    const [expanded, setExpanded] = useState(true)
    // Local override map: userId → assigned section (null = unassign)
    const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map())

    const r = parseInt(themeColor.replace('#', '').substring(0, 2), 16)
    const g = parseInt(themeColor.replace('#', '').substring(2, 4), 16)
    const b = parseInt(themeColor.replace('#', '').substring(4, 6), 16)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    // Reservists in the attendance records
    const reservists = useMemo(
        () => records.filter(rec => RESERVIST_CATS.has(rec.category ?? '')),
        [records]
    )

    // All sections from non-reservist records (for dropdown options)
    const sections = useMemo(() => {
        const seen = new Set<string>()
        const list: string[] = []
        for (const rec of records) {
            if (RESERVIST_CATS.has(rec.category ?? '')) continue
            const sec = rec.orbatSection || rec.unit
            if (sec && !seen.has(sec)) { seen.add(sec); list.push(sec) }
        }
        return list
    }, [records])

    // Derived assignment for a given reservist (local override takes priority)
    const effectiveSection = useCallback((rec: AttendanceRecord): string => {
        if (overrides.has(rec.userId)) return overrides.get(rec.userId) ?? ''
        return rec.reservistSection ?? ''
    }, [overrides])

    const handleChange = (userId: string, section: string) => {
        setOverrides(prev => {
            const next = new Map(prev)
            next.set(userId, section || null)
            return next
        })
    }

    const handleSave = async () => {
        if (overrides.size === 0) return
        setSaving(true)
        try {
            const moves: { userId: string; targetSection: string | null }[] = []
            for (const [userId, section] of overrides.entries()) {
                moves.push({ userId, targetSection: section || null })
            }
            await fetch(`/api/operations/${operationId}/attendance/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moves, removals: [], additions: [], roleChanges: [] }),
            })
            setOverrides(new Map())
            onSaved()
        } finally {
            setSaving(false)
        }
    }

    const isDirty = overrides.size > 0

    if (reservists.length === 0) return null

    const attendingCount = reservists.filter(r => r.rsvp === 'attending').length
    const assignedCount  = reservists.filter(r => effectiveSection(r)).length

    // Group reservists by type for display
    const activeRes   = reservists.filter(r => r.category === 'activeReservist')
    const inactiveRes = reservists.filter(r => r.category === 'inactiveReservist')

    const renderRow = (rec: AttendanceRecord) => {
        const current = effectiveSection(rec)
        const changed = overrides.has(rec.userId)
        return (
            <div
                key={rec.userId}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto 200px',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: changed ? 'rgba(255,255,255,0.03)' : undefined,
                }}
            >
                {/* Avatar */}
                {rec.user?.avatarURL ? (
                    <Avatar src={rec.user.avatarURL} sx={{ width: 24, height: 24, flexShrink: 0 }} />
                ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Person sx={{ fontSize: 14, color: 'rgba(237,237,237,0.3)' }} />
                    </div>
                )}

                {/* Name */}
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.user?.displayName ?? rec.userId}
                    </div>
                    {rec.orbatRole && (
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginTop: 1 }}>{rec.orbatRole}</div>
                    )}
                </div>

                {/* RSVP */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {rsvpBadge(rec.rsvp)}
                </div>

                {/* Section select */}
                <select
                    value={current}
                    onChange={e => handleChange(rec.userId, e.target.value)}
                    style={{
                        background: current ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.03)',
                        border: changed ? `1px solid ${c(0.5)}` : '1px solid rgba(255,255,255,0.1)',
                        color: current ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)',
                        borderRadius: 2,
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        width: '100%',
                        cursor: 'pointer',
                        outline: 'none',
                    }}
                >
                    <option value=''>— Unassigned —</option>
                    {sections.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                    ))}
                </select>
            </div>
        )
    }

    return (
        <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: `2px solid ${c(0.4)}` }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(v => !v)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    background: 'rgba(0,0,0,0.25)',
                    userSelect: 'none',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 3, height: 10, background: c(0.7), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8) }}>
                        Reservist Allocations
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginLeft: 4 }}>
                        {assignedCount}/{reservists.length} assigned · {attendingCount} attending
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isDirty && (
                        <button
                            onClick={e => { e.stopPropagation(); handleSave() }}
                            disabled={saving}
                            style={{
                                background: c(0.7),
                                border: 'none',
                                color: '#fff',
                                borderRadius: 2,
                                padding: '3px 12px',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                opacity: saving ? 0.6 : 1,
                            }}
                        >
                            {saving && <CircularProgress size={10} sx={{ color: '#fff' }} />}
                            Save
                        </button>
                    )}
                    {expanded ? <ExpandLess sx={{ fontSize: 18, color: 'rgba(237,237,237,0.3)' }} /> : <ExpandMore sx={{ fontSize: 18, color: 'rgba(237,237,237,0.3)' }} />}
                </div>
            </div>

            <Collapse in={expanded}>
                {/* Column headers */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto 200px',
                    gap: 10,
                    padding: '5px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    <div />
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>Name</div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>RSVP</div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>Section</div>
                </div>

                {/* Active reservists */}
                {activeRes.length > 0 && (
                    <>
                        <div style={{ padding: '4px 14px 2px', background: 'rgba(255,255,255,0.01)' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                                Active Reservists
                            </span>
                        </div>
                        {activeRes.map(renderRow)}
                    </>
                )}

                {/* Inactive reservists */}
                {inactiveRes.length > 0 && (
                    <>
                        <div style={{ padding: '4px 14px 2px', background: 'rgba(255,255,255,0.01)', borderTop: activeRes.length > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                                Inactive Reservists
                            </span>
                        </div>
                        {inactiveRes.map(renderRow)}
                    </>
                )}

                {/* Summary: assigned by section */}
                {assignedCount > 0 && (
                    <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', alignSelf: 'center', marginRight: 4 }}>
                            Summary:
                        </span>
                        {sections.map(sec => {
                            const count = reservists.filter(r => effectiveSection(r) === sec).length
                            if (count === 0) return null
                            return (
                                <span
                                    key={sec}
                                    style={{
                                        fontSize: '0.6rem', fontWeight: 600,
                                        padding: '2px 8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'rgba(237,237,237,0.6)',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {sec} <span style={{ color: c(0.8), fontWeight: 800 }}>×{count}</span>
                                </span>
                            )
                        })}
                    </div>
                )}
            </Collapse>
        </div>
    )
}
