'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CircularProgress } from '@mui/material'
import { Refresh, KeyboardArrowDown, KeyboardArrowUp, LocalOffer } from '@mui/icons-material'

type ConfirmState = { open: boolean; message: string; onConfirm: () => void }

type TicketItem = CommunityTicket & { _id: string }

// Inlined minimal status/category constants (avoids cross-boundary import issues in dashboard)
const STATUS_META: Record<string, { label: string; color: string }> = {
    open:               { label: 'Open',               color: 'rgba(237,237,237,0.6)'   },
    in_review:          { label: 'In Review',           color: 'rgba(0,195,255,0.9)'     },
    implementing:       { label: 'Implementing',        color: 'rgba(167,139,250,0.9)'   },
    implemented:        { label: 'Implemented',         color: 'rgba(74,222,128,0.9)'    },
    broken_mod:         { label: 'Broken Mod',          color: 'rgba(255,140,0,0.9)'     },
    resolved:           { label: 'Resolved',            color: 'rgba(74,222,128,0.75)'   },
    denied:             { label: 'Denied',              color: 'rgba(219,0,29,0.8)'      },
    no_action_required: { label: 'No Action Required',  color: 'rgba(237,237,237,0.4)'   },
    closed:             { label: 'Closed',              color: 'rgba(237,237,237,0.3)'   },
}

const CAT_META: Record<string, { label: string; color: string; borderColor: string }> = {
    request:         { label: 'Requests',          color: 'rgba(255,160,0,0.85)',   borderColor: 'rgba(255,160,0,0.3)'   },
    bug:             { label: 'Bug Reports',        color: 'rgba(219,0,29,0.85)',    borderColor: 'rgba(219,0,29,0.3)'    },
    mission:         { label: 'Missions',           color: 'rgba(0,195,255,0.85)',   borderColor: 'rgba(0,195,255,0.3)'   },
    campaign:        { label: 'Campaigns',          color: 'rgba(167,139,250,0.9)', borderColor: 'rgba(167,139,250,0.3)' },
    'unit-feedback': { label: 'Unit Feedback',      color: 'rgba(74,222,128,0.85)', borderColor: 'rgba(74,222,128,0.3)'  },
    complaint:       { label: 'Complaints',         color: 'rgba(255,80,80,0.85)',   borderColor: 'rgba(255,80,80,0.3)'   },
    award:           { label: 'Awards & Citations', color: 'rgba(255,200,0,0.9)',    borderColor: 'rgba(255,200,0,0.3)'   },
}

const DEPT_LABELS: Record<string, string> = { j1:'J1', j2:'J2', j3:'J3', j4:'J4', j5:'J5', j6:'J6', j7:'J7' }
const ALL_STATUSES = Object.keys(STATUS_META)
const ACTIVE_STATUSES = ['open', 'in_review', 'implementing']

const selectSx: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.7)', fontSize: '0.72rem', padding: '6px 10px',
    outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0,
    appearance: 'none', WebkitAppearance: 'none',
}


export default function CommunityTicketsTab() {
    const router = useRouter()
    const [items, setItems] = useState<TicketItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [deptFilter, setDeptFilter] = useState('all')
    const [showDeleted, setShowDeleted] = useState(false)
    const [search, setSearch] = useState('')
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [collapsedClosed, setCollapsedClosed] = useState(true)
    const [view, setView] = useState<'category' | 'table'>('category')
    const [confirmModal, setConfirmModal] = useState<ConfirmState>({ open: false, message: '', onConfirm: () => {} })

    function showConfirm(message: string, onConfirm: () => void) {
        setConfirmModal({ open: true, message, onConfirm })
    }

    const load = useCallback(() => {
        setLoading(true)
        const p = new URLSearchParams()
        if (categoryFilter === '__deleted__') {
            p.set('deleted', '1')
        } else {
            if (categoryFilter !== 'all') p.set('category', categoryFilter)
            if (showDeleted) p.set('deleted', '1')
        }
        if (deptFilter !== 'all') p.set('department', deptFilter)
        fetch(`/api/community/tickets?${p}`)
            .then(r => r.json())
            .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [categoryFilter, deptFilter, showDeleted])

    useEffect(() => { load() }, [load])

    function toggleStatus(s: string) {
        setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    }

    const filtered = items.filter(t => {
        if (categoryFilter === '__deleted__' && !t.isDeleted) return false
        if (search) {
            const q = search.toLowerCase()
            if (!t.title.toLowerCase().includes(q) && !t.authorName.toLowerCase().includes(q)) return false
        }
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(t.status)) return false
        return true
    })

    async function patch(id: string, body: Record<string, unknown>) {
        setUpdatingId(id)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        setUpdatingId(null)
    }

    async function handleStatusChange(id: string, status: string) {
        await patch(id, { status })
        setItems(prev => prev.map(t => t._id === id ? { ...t, status: status as CommunityTicketStatus } : t))
    }

    async function handleDelete(id: string) {
        showConfirm('Soft-delete this ticket? It will be hidden from members but recoverable by J4.', async () => {
            setUpdatingId(id)
            await fetch(`/api/community/tickets/${id}`, { method: 'DELETE' })
            setItems(prev => prev.map(t => t._id === id ? { ...t, isDeleted: true } : t))
            setUpdatingId(null)
        })
    }

    async function handleRestore(id: string) {
        await patch(id, { restore: true })
        setItems(prev => prev.map(t => t._id === id ? { ...t, isDeleted: false } : t))
    }

    const totalOpen = items.filter(t => ACTIVE_STATUSES.includes(t.status) && !t.isDeleted).length
    const totalPrivate = items.filter(t => t.visibility === 'private' && !t.isDeleted).length
    const totalDeleted = items.filter(t => t.isDeleted).length

    const categories = Object.keys(CAT_META) as CommunityTicketCategory[]

    return (
        <>
        {confirmModal.open && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#111', border: '1px solid rgba(219,0,29,0.35)', borderTop: '3px solid rgba(219,0,29,0.6)', padding: '24px 28px', maxWidth: 420, width: '90%' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', marginBottom: 20, lineHeight: 1.5 }}>{confirmModal.message}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setConfirmModal(s => ({ ...s, open: false }))} style={{ padding: '7px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>CANCEL</button>
                        <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(s => ({ ...s, open: false })) }} style={{ padding: '7px 18px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.9)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em' }}>CONFIRM</button>
                    </div>
                </div>
            </div>
        )}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(237,237,237,0.25)' }}>COMMUNITY TICKETS</span>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                    <Stat label='Active' value={totalOpen} color='rgba(237,237,237,0.5)' />
                    <Stat label='Private' value={totalPrivate} color='rgba(255,80,80,0.7)' />
                    <Stat label='Deleted' value={totalDeleted} color='rgba(219,0,29,0.6)' />
                </div>
            </div>

            {/* ── SINGLE-LINE FILTER BAR ── */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusDropdown selected={selectedStatuses} onToggle={toggleStatus} onClear={() => setSelectedStatuses([])} />

                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectSx}>
                    <option value='all' style={{ background: '#111' }}>All Categories</option>
                    {Object.entries(CAT_META).map(([k, v]) => <option key={k} value={k} style={{ background: '#111' }}>{v.label}</option>)}
                    <option value='__deleted__' style={{ background: '#111', color: 'rgba(219,0,29,0.8)' }}>Deleted Tickets</option>
                </select>

                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={selectSx}>
                    <option value='all' style={{ background: '#111' }}>All Depts</option>
                    {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k} style={{ background: '#111' }}>{v}</option>)}
                </select>

                <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search title / author…' style={{ ...selectSx, minWidth: 180, color: 'rgba(237,237,237,0.65)' }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <div onClick={() => setShowDeleted(v => !v)} style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', background: showDeleted ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 0.15s' }}>
                        <div style={{ position: 'absolute', top: 2, left: showDeleted ? 12 : 2, width: 10, height: 10, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)' }}>Deleted</span>
                </label>

                <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', padding: '6px 10px', cursor: 'pointer', fontSize: '0.65rem' }}>
                    <Refresh style={{ fontSize: 13 }} /> Refresh
                </button>

                <div style={{ display: 'flex', gap: 0, marginLeft: 'auto' }}>
                    {(['category', 'table'] as const).map(v => (
                        <button key={v} onClick={() => setView(v)} style={{ padding: '4px 10px', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', background: view === v ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${view === v ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)'}`, color: view === v ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)', cursor: 'pointer' }}>
                            {v.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                    <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
                </div>
            ) : view === 'category' ? (
                /* ── CATEGORY CARD VIEW ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {categories.map(cat => {
                        const catItems = filtered.filter(t => t.category === cat)
                        if (!catItems.length) return null
                        const catMeta = CAT_META[cat]
                        const active = catItems.filter(t => ACTIVE_STATUSES.includes(t.status) && !t.isDeleted)
                        const closed = catItems.filter(t => !ACTIVE_STATUSES.includes(t.status) || t.isDeleted)

                        return (
                            <div key={cat}>
                                {/* Category header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${catMeta.borderColor}` }}>
                                    <div style={{ width: 3, height: 16, background: catMeta.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.16em', color: catMeta.color }}>{catMeta.label.toUpperCase()}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, color: catMeta.color, marginLeft: 'auto' }}>
                                        {String(active.length).padStart(2, '0')} active
                                    </span>
                                </div>

                                {/* Active cards */}
                                {active.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6, marginBottom: 8 }}>
                                        {active.map(t => <TicketCard key={t._id} t={t} catMeta={catMeta} onStatusChange={handleStatusChange} onDelete={handleDelete} onRestore={handleRestore} onView={id => router.push(`/community/tickets/${id}`)} isUpdating={updatingId === t._id} />)}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', padding: '12px 0', fontStyle: 'italic' }}>No active tickets.</div>
                                )}

                                {/* Closed (collapsible) */}
                                {closed.length > 0 && (
                                    <div>
                                        <button onClick={() => setCollapsedClosed(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderTop: `1px solid ${catMeta.borderColor}55`, padding: '6px 0', cursor: 'pointer', color: 'rgba(237,237,237,0.25)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', width: '100%' }}>
                                            {collapsedClosed ? <KeyboardArrowDown style={{ fontSize: 14 }} /> : <KeyboardArrowUp style={{ fontSize: 14 }} />}
                                            CLOSED / RESOLVED
                                            <span style={{ fontFamily: 'monospace' }}>[{String(closed.length).padStart(2, '0')}]</span>
                                        </button>
                                        {!collapsedClosed && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6, marginTop: 6 }}>
                                                {closed.map(t => <TicketCard key={t._id} t={t} catMeta={catMeta} onStatusChange={handleStatusChange} onDelete={handleDelete} onRestore={handleRestore} onView={id => router.push(`/community/tickets/${id}`)} isUpdating={updatingId === t._id} />)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {filtered.length === 0 && (
                        <div style={{ color: 'rgba(237,237,237,0.2)', fontSize: '0.82rem', padding: '32px 0', textAlign: 'center' }}>No tickets found.</div>
                    )}
                </div>
            ) : (
                /* ── TABLE VIEW ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 70px 80px 80px 60px', gap: 8, padding: '5px 10px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)' }}>
                        <span>TITLE</span><span>TYPE</span><span>STATUS</span><span>DEPT</span><span>VOTES</span><span>ACTIONS</span><span>VIEW</span>
                    </div>
                    {filtered.length === 0 && <div style={{ color: 'rgba(237,237,237,0.2)', padding: '24px 0', textAlign: 'center', fontSize: '0.8rem' }}>No tickets found.</div>}
                    {filtered.map(t => {
                        const catMeta = CAT_META[t.category]
                        const statusMeta = STATUS_META[t.status] ?? STATUS_META.open
                        const isUpdating = updatingId === t._id
                        return (
                            <div key={t._id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 70px 80px 80px 60px', gap: 8, padding: '7px 10px', alignItems: 'center', background: t.isDeleted ? 'rgba(219,0,29,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${t.isDeleted ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.05)'}`, borderLeft: `2px solid ${catMeta?.color ?? 'rgba(255,255,255,0.15)'}`, opacity: t.isDeleted ? 0.6 : 1 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.isDeleted && <span style={{ fontSize: '0.56rem', color: 'rgba(219,0,29,0.6)', marginRight: 5, fontWeight: 800 }}>DEL</span>}
                                        {t.visibility === 'private' && <span style={{ fontSize: '0.56rem', color: 'rgba(255,80,80,0.6)', marginRight: 5, fontWeight: 800 }}>PRV</span>}
                                        {t.title}
                                    </div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.28)', marginTop: 1 }}>{t.isAnonymous ? 'Anonymous' : t.authorName} · {new Date(t.createdAt).toLocaleDateString()}</div>
                                    {t.tags && t.tags.length > 0 && (
                                        <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                                            {t.tags.map(tag => <span key={tag} style={{ fontSize: '0.52rem', padding: '1px 4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.3)', display: 'flex', alignItems: 'center', gap: 2 }}><LocalOffer style={{ fontSize: 7 }} />{tag}</span>)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: catMeta?.color ?? 'rgba(237,237,237,0.5)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t.subtype.replace(/-/g, ' ')}
                                </div>
                                <select value={t.status} onChange={e => handleStatusChange(t._id, e.target.value)} disabled={isUpdating} style={{ ...selectSx, color: statusMeta.color, fontSize: '0.6rem', padding: '3px 6px' }}>
                                    {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: '#111' }}>{STATUS_META[s].label}</option>)}
                                </select>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                                    {(t.departments?.length ? t.departments : [t.department]).map(d => DEPT_LABELS[d] ?? d).join(',')}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, color: t.voteScore > 0 ? 'rgba(74,222,128,0.7)' : t.voteScore < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)' }}>
                                    {t.voteScore > 0 ? '+' : ''}{t.voteScore} ({t.commentCount}c)
                                </div>
                                <div>
                                    {isUpdating ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} /> :
                                        t.isDeleted ? (
                                            <button onClick={() => handleRestore(t._id)} style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: 'rgba(74,222,128,0.75)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px', cursor: 'pointer' }}>RESTORE</button>
                                        ) : (
                                            <button onClick={() => handleDelete(t._id)} style={{ background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px', cursor: 'pointer' }}>DELETE</button>
                                        )
                                    }
                                </div>
                                <button onClick={() => router.push(`/community/tickets/${t._id}`)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.5)', padding: '3px 7px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                                    VIEW
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
        </>
    )
}


function TicketCard({ t, catMeta, onStatusChange, onDelete, onRestore, onView, isUpdating }: {
    t: TicketItem
    catMeta: { label: string; color: string; borderColor: string }
    onStatusChange: (id: string, s: string) => void
    onDelete: (id: string) => void
    onRestore: (id: string) => void
    onView: (id: string) => void
    isUpdating: boolean
}) {
    const statusMeta = STATUS_META[t.status] ?? STATUS_META.open
    return (
        <div style={{ background: t.isDeleted ? 'rgba(219,0,29,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${catMeta.borderColor}`, borderLeft: `3px solid ${catMeta.color}`, display: 'flex', flexDirection: 'column', opacity: t.isDeleted ? 0.65 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${catMeta.borderColor}55` }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', padding: '1px 5px', color: statusMeta.color, border: `1px solid ${statusMeta.color}44` }}>{statusMeta.label}</span>
                {t.isDeleted && <span style={{ fontSize: '0.56rem', fontWeight: 800, color: 'rgba(219,0,29,0.6)', letterSpacing: '0.1em' }}>DELETED</span>}
                {t.visibility === 'private' && <span style={{ fontSize: '0.56rem', fontWeight: 800, color: 'rgba(255,80,80,0.6)', letterSpacing: '0.1em' }}>PRIVATE</span>}
                {t.tags?.slice(0, 2).map(tag => (
                    <span key={tag} style={{ fontSize: '0.52rem', padding: '1px 4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.35)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <LocalOffer style={{ fontSize: 7 }} />{tag}
                    </span>
                ))}
                <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: t.voteScore > 0 ? 'rgba(74,222,128,0.6)' : t.voteScore < 0 ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.2)' }}>
                    {t.voteScore > 0 ? '+' : ''}{t.voteScore}
                </span>
            </div>
            <div style={{ padding: '8px 10px', flex: 1 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', marginBottom: 3, lineHeight: 1.3 }}>{t.title}</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>
                    {t.isAnonymous ? 'Anonymous' : t.authorName} · {new Date(t.createdAt).toLocaleDateString()}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderTop: `1px solid ${catMeta.borderColor}55` }}>
                {isUpdating ? <CircularProgress size={13} style={{ color: 'rgba(219,0,29,0.5)' }} /> : (
                    <>
                        <select value={t.status} onChange={e => onStatusChange(t._id, e.target.value)} style={{ ...selectSx, fontSize: '0.6rem', padding: '3px 6px', flex: 1, color: statusMeta.color }}>
                            {Object.keys(STATUS_META).map(s => <option key={s} value={s} style={{ background: '#111' }}>{STATUS_META[s].label}</option>)}
                        </select>
                        {t.isDeleted
                            ? <button onClick={() => onRestore(t._id)} style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: 'rgba(74,222,128,0.75)', fontSize: '0.6rem', fontWeight: 800, padding: '3px 7px', cursor: 'pointer' }}>RESTORE</button>
                            : <button onClick={() => onDelete(t._id)} style={{ background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.6rem', fontWeight: 800, padding: '3px 7px', cursor: 'pointer' }}>DEL</button>
                        }
                        <button onClick={() => onView(t._id)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '3px 8px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                            VIEW
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}


function Stat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.22)', letterSpacing: '0.1em' }}>{label}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color }}>{String(value).padStart(2, '0')}</span>
        </div>
    )
}


function StatusDropdown({ selected, onToggle, onClear }: { selected: string[]; onToggle: (s: string) => void; onClear: () => void }) {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])


    const label = selected.length === 0
        ? 'All Statuses'
        : selected.length === 1
            ? STATUS_META[selected[0]]?.label ?? selected[0]
            : `${selected.length} statuses`

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, ...selectSx, padding: '6px 28px 6px 10px', minWidth: 160, position: 'relative' }}>
                {selected.length > 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(219,0,29,0.7)', flexShrink: 0 }} />}
                <span style={{ fontSize: '0.72rem', color: selected.length > 0 ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.5)' }}>{label}</span>
                <span style={{ position: 'absolute', right: 8, fontSize: 10, color: 'rgba(237,237,237,0.4)' }}>▾</span>
            </button>
            {open && (
                <div
                    style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#111', border: '1px solid rgba(255,255,255,0.12)', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', maxHeight: 320, overflowY: 'auto' }}
                    onWheel={e => e.stopPropagation()}
                >
                    {selected.length > 0 && (
                        <button onClick={() => { onClear(); setOpen(false) }} style={{ display: 'block', width: '100%', padding: '7px 12px', background: 'rgba(219,0,29,0.08)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(219,0,29,0.6)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', textAlign: 'left' }}>
                            ✕  CLEAR FILTER
                        </button>
                    )}
                    {ALL_STATUSES.map(s => {
                        const active = selected.includes(s)
                        const meta = STATUS_META[s]
                        return (
                            <button key={s} onClick={() => onToggle(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: active ? `${meta.color}12` : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: active ? meta.color : 'rgba(237,237,237,0.5)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0, opacity: active ? 1 : 0.4 }} />
                                {meta.label}
                                {active && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
