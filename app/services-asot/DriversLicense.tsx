//
'use client'

import { useState, useEffect } from 'react'

type Status = 'Active' | 'Under Review' | 'Revoked'

interface Entry {
    _id: string
    name: string
    section: string
    status: Status
}

const SECTIONS = ['PHQ', 'Alpha', 'Bravo', 'Charlie']

const STATUS_CONFIG: Record<Status, { color: string; dot: string; bg: string }> = {
    'Active':       { color: 'rgba(0,200,80,0.85)',   dot: '#00c850',           bg: 'rgba(0,200,80,0.08)' },
    'Under Review': { color: 'rgba(240,165,0,0.9)',   dot: 'rgba(240,165,0,1)', bg: 'rgba(240,165,0,0.08)' },
    'Revoked':      { color: 'rgba(219,0,29,0.85)',   dot: 'rgba(219,0,29,1)',  bg: 'rgba(219,0,29,0.08)' },
}

const label: React.CSSProperties = {
    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
}

export default function DriversLicense({ canEdit }: { canEdit: boolean }) {
    const [entries, setEntries] = useState<Entry[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState(false)
    const [newNames, setNewNames] = useState<Record<string, string>>({})
    const [adding, setAdding] = useState<Record<string, boolean>>({})
    const [error, setError] = useState('')

    useEffect(() => {
        fetch('/api/services-asot/drivers-license')
            .then(r => r.json())
            .then(data => { setEntries(data); setLoading(false) })
            .catch(() => { setError('Failed to load data'); setLoading(false) })
    }, [])

    async function handleStatusChange(id: string, status: Status) {
        setEntries(prev => prev.map(e => e._id === id ? { ...e, status } : e))
        await fetch(`/api/services-asot/drivers-license/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
    }

    async function handleRemove(id: string) {
        setEntries(prev => prev.filter(e => e._id !== id))
        await fetch(`/api/services-asot/drivers-license/${id}`, { method: 'DELETE' })
    }

    async function handleAdd(section: string) {
        const name = (newNames[section] ?? '').trim()
        if (!name) return
        setAdding(prev => ({ ...prev, [section]: true }))
        const res = await fetch('/api/services-asot/drivers-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, section, status: 'Under Review' }),
        })
        const entry = await res.json()
        setEntries(prev => [...prev, entry])
        setNewNames(prev => ({ ...prev, [section]: '' }))
        setAdding(prev => ({ ...prev, [section]: false }))
    }

    const bySection = SECTIONS.reduce<Record<string, Entry[]>>((acc, s) => {
        acc[s] = entries.filter(e => e.section === s)
        return acc
    }, {})

    const totalActive = entries.filter(e => e.status === 'Active').length
    const totalReview = entries.filter(e => e.status === 'Under Review').length
    const totalRevoked = entries.filter(e => e.status === 'Revoked').length

    return (
        <div style={{ minHeight: '100vh', background: '#080808', color: 'rgba(237,237,237,0.85)', fontFamily: 'inherit' }}>

            {/* Page header */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '28px 36px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ width: 3, height: 22, background: 'rgba(219,0,29,0.8)', flexShrink: 0 }} />
                            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                                Driver's License Registry
                            </h1>
                        </div>
                        <div style={{ paddingLeft: 15, display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ ...label, color: 'rgba(219,0,29,0.5)', fontSize: '0.48rem', letterSpacing: '0.28em' }}>
                                Restricted — 1-2 Personnel Only
                            </span>
                            {!loading && (
                                <>
                                    <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.1)' }} />
                                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>
                                        {entries.length} personnel
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        {/* Summary counts */}
                        {!loading && (
                            <div style={{ display: 'flex', gap: 16 }}>
                                {([
                                    { status: 'Active', count: totalActive },
                                    { status: 'Under Review', count: totalReview },
                                    { status: 'Revoked', count: totalRevoked },
                                ] as { status: Status; count: number }[]).map(({ status, count }) => (
                                    <div key={status} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: STATUS_CONFIG[status].color }}>{count}</div>
                                        <div style={{ ...label, color: 'rgba(237,237,237,0.25)', fontSize: '0.45rem' }}>{status}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {canEdit && (
                            <button
                                onClick={() => setEditing(e => !e)}
                                style={{
                                    padding: '7px 18px',
                                    background: editing ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)',
                                    border: editing ? '1px solid rgba(219,0,29,0.45)' : '1px solid rgba(255,255,255,0.1)',
                                    color: editing ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.5)',
                                    cursor: 'pointer',
                                    ...label,
                                }}
                            >
                                {editing ? 'Done Editing' : 'Edit'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 36px' }}>
                {error && (
                    <div style={{ color: 'rgba(219,0,29,0.8)', fontSize: '0.75rem', marginBottom: 20 }}>{error}</div>
                )}
                {loading ? (
                    <div style={{ ...label, color: 'rgba(237,237,237,0.2)', paddingTop: 40 }}>Loading…</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
                        {SECTIONS.map(section => {
                            const sectionEntries = bySection[section] ?? []
                            const activeCount = sectionEntries.filter(e => e.status === 'Active').length
                            return (
                                <div
                                    key={section}
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        display: 'flex', flexDirection: 'column',
                                    }}
                                >
                                    {/* Section header */}
                                    <div style={{
                                        padding: '12px 18px',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        background: 'rgba(0,0,0,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ ...label, color: 'rgba(219,0,29,0.7)', fontSize: '0.6rem' }}>
                                                {section}
                                            </span>
                                            <span style={{ ...label, color: 'rgba(237,237,237,0.2)', fontSize: '0.48rem' }}>
                                                {sectionEntries.length} personnel
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.58rem', color: 'rgba(0,200,80,0.6)', fontWeight: 700 }}>
                                            {activeCount} active
                                        </span>
                                    </div>

                                    {/* Entries */}
                                    <div style={{ flex: 1 }}>
                                        {sectionEntries.length === 0 && !editing && (
                                            <div style={{ padding: '16px 18px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>
                                                No personnel
                                            </div>
                                        )}
                                        {sectionEntries.map((entry, i) => {
                                            const cfg = STATUS_CONFIG[entry.status]
                                            return (
                                                <div
                                                    key={entry._id}
                                                    style={{
                                                        display: 'flex', alignItems: 'center',
                                                        padding: '10px 18px',
                                                        borderBottom: i < sectionEntries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                                        gap: 12,
                                                    }}
                                                >
                                                    {/* Name */}
                                                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>{entry.name}</span>

                                                    {/* Status */}
                                                    {editing ? (
                                                        <select
                                                            value={entry.status}
                                                            onChange={e => handleStatusChange(entry._id, e.target.value as Status)}
                                                            style={{
                                                                background: cfg.bg,
                                                                border: `1px solid ${cfg.dot}40`,
                                                                color: cfg.color,
                                                                fontSize: '0.62rem',
                                                                fontWeight: 700,
                                                                letterSpacing: '0.08em',
                                                                padding: '4px 8px',
                                                                cursor: 'pointer',
                                                                outline: 'none',
                                                            }}
                                                        >
                                                            <option value="Active">Active</option>
                                                            <option value="Under Review">Under Review</option>
                                                            <option value="Revoked">Revoked</option>
                                                        </select>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: cfg.color, letterSpacing: '0.06em' }}>
                                                                {entry.status}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Remove button */}
                                                    {editing && (
                                                        <button
                                                            onClick={() => handleRemove(entry._id)}
                                                            title="Remove"
                                                            style={{
                                                                background: 'none',
                                                                border: '1px solid rgba(219,0,29,0.25)',
                                                                color: 'rgba(219,0,29,0.5)',
                                                                cursor: 'pointer',
                                                                width: 22, height: 22,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '0.7rem', flexShrink: 0,
                                                                lineHeight: 1,
                                                            }}
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}

                                        {/* Add row */}
                                        {editing && (
                                            <div style={{ display: 'flex', gap: 8, padding: '10px 18px', borderTop: sectionEntries.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                <input
                                                    value={newNames[section] ?? ''}
                                                    onChange={e => setNewNames(prev => ({ ...prev, [section]: e.target.value }))}
                                                    onKeyDown={e => e.key === 'Enter' && handleAdd(section)}
                                                    placeholder="Name…"
                                                    style={{
                                                        flex: 1,
                                                        background: 'rgba(0,0,0,0.5)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        color: 'rgba(237,237,237,0.85)',
                                                        fontSize: '0.75rem',
                                                        padding: '5px 10px',
                                                        outline: 'none',
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleAdd(section)}
                                                    disabled={adding[section] || !newNames[section]?.trim()}
                                                    style={{
                                                        padding: '5px 14px',
                                                        background: 'rgba(219,0,29,0.1)',
                                                        border: '1px solid rgba(219,0,29,0.35)',
                                                        color: 'rgba(219,0,29,0.8)',
                                                        cursor: adding[section] ? 'not-allowed' : 'pointer',
                                                        ...label,
                                                        opacity: !newNames[section]?.trim() ? 0.4 : 1,
                                                    }}
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
