'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { CircularProgress } from '@mui/material'
import { OpenInNew, Refresh, FilterList } from '@mui/icons-material'

type TicketItem = CommunityTicket & { _id: string }

const CATEGORY_OPTIONS = [
    { value: 'all', label: 'All Categories' },
    { value: 'request', label: 'Requests' },
    { value: 'bug', label: 'Bug Reports' },
    { value: 'mission', label: 'Missions' },
    { value: 'campaign', label: 'Campaigns' },
    { value: 'unit-feedback', label: 'Unit Feedback' },
    { value: 'complaint', label: 'Complaints' },
    { value: 'award', label: 'Awards' },
]

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Statuses' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
]

const DEPT_OPTIONS = [
    { value: 'all', label: 'All Depts' },
    { value: 'j1', label: 'J1' }, { value: 'j2', label: 'J2' },
    { value: 'j3', label: 'J3' }, { value: 'j4', label: 'J4' },
    { value: 'j5', label: 'J5' }, { value: 'j6', label: 'J6' },
    { value: 'j7', label: 'J7' },
]

const STATUS_COLOURS: Record<string, string> = {
    open: 'rgba(237,237,237,0.55)',
    in_progress: 'rgba(0,195,255,0.85)',
    resolved: 'rgba(74,222,128,0.85)',
    closed: 'rgba(237,237,237,0.3)',
}

const STATUS_LABELS: Record<string, string> = {
    open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
}

const CAT_COLOURS: Record<string, string> = {
    request: 'rgba(255,160,0,0.75)',
    bug: 'rgba(219,0,29,0.75)',
    mission: 'rgba(0,195,255,0.75)',
    campaign: 'rgba(167,139,250,0.8)',
    'unit-feedback': 'rgba(74,222,128,0.75)',
    complaint: 'rgba(255,80,80,0.75)',
    award: 'rgba(255,200,0,0.8)',
}

const SUBTYPE_LABELS: Record<string, string> = {
    'mod-request': 'Mod Request', 'feature-request': 'Feature Request',
    'bug-arma': 'Bug — Arma', 'bug-discord': 'Bug — Discord', 'bug-website': 'Bug — Website',
    'bug-milpack': 'Bug — Milpack', 'bug-teamspeak': 'Bug — TeamSpeak',
    'bug-other-game': 'Bug — Other Game', 'bug-other': 'Bug — Other',
    mission: 'Mission', campaign: 'Campaign', 'unit-feedback': 'Unit Feedback',
    'complaint-individual': 'Complaint — Individual', 'complaint-group': 'Complaint — Group',
    'complaint-department': 'Complaint — Dept', 'award-nomination': 'Award Nomination',
    'award-creation': 'Award Idea',
}

const selectSx: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.7)', fontSize: '0.72rem', padding: '6px 10px',
    outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0,
}


export default function CommunityTicketsTab() {
    const [items, setItems] = useState<TicketItem[]>([])
    const [loading, setLoading] = useState(true)
    const [category, setCategory] = useState('all')
    const [status, setStatus] = useState('all')
    const [department, setDepartment] = useState('all')
    const [showDeleted, setShowDeleted] = useState(false)
    const [search, setSearch] = useState('')
    const [updatingId, setUpdatingId] = useState<string | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        const p = new URLSearchParams()
        if (category !== 'all') p.set('category', category)
        if (status !== 'all') p.set('status', status)
        if (department !== 'all') p.set('department', department)
        if (showDeleted) p.set('deleted', '1')
        fetch(`/api/community/tickets?${p}`)
            .then(r => r.json())
            .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [category, status, department, showDeleted])

    useEffect(() => { load() }, [load])

    const filtered = items.filter(t => {
        if (!search) return true
        const q = search.toLowerCase()
        return t.title.toLowerCase().includes(q) || t.authorName.toLowerCase().includes(q)
    })

    async function handleStatusChange(id: string, newStatus: string) {
        setUpdatingId(id)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        })
        setItems(prev => prev.map(t => t._id === id ? { ...t, status: newStatus as CommunityTicketStatus } : t))
        setUpdatingId(null)
    }

    async function handleDeptChange(id: string, dept: string) {
        setUpdatingId(id)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department: dept }),
        })
        setItems(prev => prev.map(t => t._id === id ? { ...t, department: dept } : t))
        setUpdatingId(null)
    }

    async function handleDelete(id: string) {
        if (!confirm('Soft-delete this ticket? It will be hidden from members but visible here.')) return
        setUpdatingId(id)
        await fetch(`/api/community/tickets/${id}`, { method: 'DELETE' })
        setItems(prev => prev.map(t => t._id === id ? { ...t, isDeleted: true } : t))
        setUpdatingId(null)
    }

    async function handleRestore(id: string) {
        setUpdatingId(id)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restore: true }),
        })
        setItems(prev => prev.map(t => t._id === id ? { ...t, isDeleted: false } : t))
        setUpdatingId(null)
    }

    const openCount = items.filter(t => t.status === 'open' && !t.isDeleted).length
    const privateCount = items.filter(t => t.visibility === 'private' && !t.isDeleted).length
    const deletedCount = items.filter(t => t.isDeleted).length

    return (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(237,237,237,0.25)' }}>
                    COMMUNITY TICKETS
                </div>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Summary badges */}
                    <StatBadge label='Open' value={openCount} color='rgba(237,237,237,0.5)' />
                    <StatBadge label='Private' value={privateCount} color='rgba(255,80,80,0.7)' />
                    <StatBadge label='Deleted' value={deletedCount} color='rgba(219,0,29,0.6)' />
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <FilterList style={{ fontSize: 16, color: 'rgba(237,237,237,0.25)' }} />

                <select value={category} onChange={e => setCategory(e.target.value)} style={selectSx}>
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>)}
                </select>

                <select value={status} onChange={e => setStatus(e.target.value)} style={selectSx}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>)}
                </select>

                <select value={department} onChange={e => setDepartment(e.target.value)} style={selectSx}>
                    {DEPT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>)}
                </select>

                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder='Search title / author…'
                    style={{ ...selectSx, minWidth: 200, color: 'rgba(237,237,237,0.6)' }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <div onClick={() => setShowDeleted(v => !v)} style={{
                        width: 28, height: 16, borderRadius: 8, position: 'relative',
                        background: showDeleted ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)',
                        border: `1px solid ${showDeleted ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        cursor: 'pointer', transition: 'background 0.15s',
                    }}>
                        <div style={{
                            position: 'absolute', top: 2, left: showDeleted ? 12 : 2,
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.15s',
                        }} />
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.06em' }}>Show deleted</span>
                </label>

                <button onClick={load} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(237,237,237,0.4)', padding: '6px 10px', cursor: 'pointer',
                    fontSize: '0.68rem', letterSpacing: '0.08em',
                }}>
                    <Refresh style={{ fontSize: 13 }} /> REFRESH
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                    <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ color: 'rgba(237,237,237,0.25)', fontSize: '0.82rem', padding: '32px 0', textAlign: 'center', letterSpacing: '0.06em' }}>
                    No tickets found.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Header row */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 80px 90px 70px',
                        gap: 8, padding: '6px 12px',
                        background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)',
                    }}>
                        <span>TITLE</span>
                        <span>TYPE</span>
                        <span>STATUS</span>
                        <span>DEPT</span>
                        <span>VOTES</span>
                        <span>ACTIONS</span>
                        <span>VIEW</span>
                    </div>

                    {filtered.map(t => {
                        const isUpdating = updatingId === t._id
                        const catCol = CAT_COLOURS[t.category] ?? 'rgba(237,237,237,0.5)'
                        return (
                            <div key={t._id} style={{
                                display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 80px 90px 70px',
                                gap: 8, padding: '8px 12px', alignItems: 'center',
                                background: t.isDeleted ? 'rgba(219,0,29,0.04)' : t.visibility === 'private' ? 'rgba(255,80,80,0.03)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${t.isDeleted ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.05)'}`,
                                borderLeft: `2px solid ${t.isDeleted ? 'rgba(219,0,29,0.4)' : catCol}`,
                                opacity: t.isDeleted ? 0.65 : 1,
                            }}>
                                {/* Title */}
                                <div style={{ minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {t.isDeleted && <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.6)', marginRight: 6, fontWeight: 800 }}>DELETED</span>}
                                        {t.visibility === 'private' && <span style={{ fontSize: '0.6rem', color: 'rgba(255,80,80,0.6)', marginRight: 6, fontWeight: 800 }}>PRIVATE</span>}
                                        {t.title}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                        {t.isAnonymous ? 'Anonymous' : t.authorName} · {new Date(t.createdAt).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Subtype */}
                                <div style={{ fontSize: '0.62rem', color: catCol, fontWeight: 700, letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {SUBTYPE_LABELS[t.subtype] ?? t.subtype}
                                </div>

                                {/* Status select */}
                                <select
                                    value={t.status}
                                    onChange={e => handleStatusChange(t._id, e.target.value)}
                                    disabled={isUpdating}
                                    style={{
                                        background: 'rgba(0,0,0,0.3)', border: `1px solid ${STATUS_COLOURS[t.status]}44`,
                                        color: STATUS_COLOURS[t.status], fontSize: '0.62rem', fontWeight: 700,
                                        padding: '4px 6px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0,
                                    }}
                                >
                                    {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                                        <option key={s} value={s} style={{ background: '#111' }}>{STATUS_LABELS[s]}</option>
                                    ))}
                                </select>

                                {/* Dept select */}
                                <select
                                    value={t.department}
                                    onChange={e => handleDeptChange(t._id, e.target.value)}
                                    disabled={isUpdating}
                                    style={{
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'rgba(237,237,237,0.5)', fontSize: '0.62rem',
                                        padding: '4px 6px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0,
                                    }}
                                >
                                    {['j1','j2','j3','j4','j5','j6','j7'].map(d => (
                                        <option key={d} value={d} style={{ background: '#111' }}>{d.toUpperCase()}</option>
                                    ))}
                                </select>

                                {/* Vote score */}
                                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: t.voteScore > 0 ? 'rgba(74,222,128,0.7)' : t.voteScore < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)' }}>
                                    {t.voteScore > 0 ? '+' : ''}{t.voteScore} ({t.commentCount}c)
                                </div>

                                {/* Delete / restore */}
                                <div>
                                    {isUpdating ? (
                                        <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} />
                                    ) : t.isDeleted ? (
                                        <button onClick={() => handleRestore(t._id)} style={{
                                            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                                            color: 'rgba(74,222,128,0.75)', fontSize: '0.62rem', fontWeight: 800,
                                            letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer',
                                        }}>
                                            RESTORE
                                        </button>
                                    ) : (
                                        <button onClick={() => handleDelete(t._id)} style={{
                                            background: 'transparent', border: '1px solid rgba(219,0,29,0.2)',
                                            color: 'rgba(219,0,29,0.5)', fontSize: '0.62rem', fontWeight: 800,
                                            letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer',
                                        }}>
                                            DELETE
                                        </button>
                                    )}
                                </div>

                                {/* View link */}
                                <Link href={`/community/tickets/${t._id}`} target='_blank'>
                                    <button style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'rgba(237,237,237,0.4)', padding: '4px 8px', cursor: 'pointer',
                                        fontSize: '0.62rem', letterSpacing: '0.06em',
                                    }}>
                                        <OpenInNew style={{ fontSize: 11 }} /> VIEW
                                    </button>
                                </Link>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}


function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>{label}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color }}>{String(value).padStart(2, '0')}</span>
        </div>
    )
}
