'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CircularProgress } from '@mui/material'
import { Refresh, SwapHoriz } from '@mui/icons-material'

type TicketItem = CommunityTicket & { _id: string }

const STATUS_META: Record<string, { label: string; color: string }> = {
    open:               { label: 'Open',               color: 'rgba(237,237,237,0.6)'   },
    in_review:          { label: 'In Review',           color: 'rgba(0,195,255,0.9)'     },
    implementing:       { label: 'Implementing',        color: 'rgba(167,139,250,0.9)'   },
    implemented:        { label: 'Implemented',         color: 'rgba(74,222,128,0.9)'    },
    broken_mod:         { label: 'Broken Mod',          color: 'rgba(255,140,0,0.9)'     },
    resolved:           { label: 'Resolved',            color: 'rgba(74,222,128,0.75)'   },
    denied:             { label: 'Denied',              color: 'rgba(219,0,29,0.8)'      },
    no_action_required: { label: 'No Action',           color: 'rgba(237,237,237,0.4)'   },
    closed:             { label: 'Closed',              color: 'rgba(237,237,237,0.3)'   },
}

const CAT_META: Record<string, { label: string; color: string }> = {
    request:         { label: 'Request',          color: 'rgba(255,160,0,0.85)'   },
    bug:             { label: 'Bug',               color: 'rgba(219,0,29,0.85)'    },
    mission:         { label: 'Mission',           color: 'rgba(0,195,255,0.85)'   },
    campaign:        { label: 'Campaign',          color: 'rgba(167,139,250,0.9)'  },
    'unit-feedback': { label: 'Feedback',          color: 'rgba(74,222,128,0.85)'  },
    complaint:       { label: 'Complaint',         color: 'rgba(255,80,80,0.85)'   },
    award:           { label: 'Award',             color: 'rgba(255,200,0,0.9)'    },
}

const DEPT_LABELS: Record<string, string> = { j1:'J1', j2:'J2', j3:'J3', j4:'J4', j5:'J5', j6:'J6', j7:'J7' }
const DEPTS = Object.keys(DEPT_LABELS)
const ALL_STATUSES = Object.keys(STATUS_META)
const ACTIVE_STATUSES = ['open', 'in_review', 'implementing']

const selectSx: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem', padding: '5px 8px',
    outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0,
    appearance: 'none', WebkitAppearance: 'none', colorScheme: 'dark',
}

interface Props {
    department: string
    canManage: boolean
    isJ4?: boolean
    returnPath?: string
}

export default function DeptTicketsTab({ department, canManage, isJ4 = false, returnPath }: Props) {
    const router = useRouter()
    const [items, setItems]             = useState<TicketItem[]>([])
    const [loading, setLoading]         = useState(true)
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [statusFilter, setStatusFilter]     = useState('all')
    const [search, setSearch]           = useState('')
    const [updatingId, setUpdatingId]   = useState<string | null>(null)
    // Transfer state: ticketId → target dept
    const [transferOpen, setTransferOpen]   = useState<string | null>(null)
    const [transferTarget, setTransferTarget] = useState('')
    const [transferNote, setTransferNote]   = useState('')
    const [transferring, setTransferring]   = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ department })
            if (categoryFilter !== 'all') p.set('category', categoryFilter)
            const res = await fetch(`/api/feedback?${p}`)
            const data = await res.json()
            setItems(Array.isArray(data) ? data : [])
        } finally { setLoading(false) }
    }, [department, categoryFilter])

    useEffect(() => { load() }, [load])

    const filtered = items.filter(t => {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        if (search) {
            const q = search.toLowerCase()
            if (!t.title.toLowerCase().includes(q) && !t.authorName.toLowerCase().includes(q)) return false
        }
        return true
    })

    const active = filtered.filter(t => ACTIVE_STATUSES.includes(t.status) && !t.isDeleted)
    const inactive = filtered.filter(t => !ACTIVE_STATUSES.includes(t.status) || t.isDeleted)

    async function handleStatusChange(id: string, status: string) {
        setUpdatingId(id)
        await fetch(`/api/feedback/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        setItems(prev => prev.map(t => t._id === id ? { ...t, status: status as CommunityTicketStatus } : t))
        setUpdatingId(null)
    }

    async function doTransfer(id: string) {
        if (!transferTarget) return
        setTransferring(true)
        try {
            const res = await fetch(`/api/feedback/${id}/transfer`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toDepartment: transferTarget, ...(transferNote.trim() ? { note: transferNote.trim() } : {}) }),
            })
            if (res.ok) {
                setTransferOpen(null)
                setTransferTarget('')
                setTransferNote('')
                await load()
            }
        } finally { setTransferring(false) }
    }

    const totalActive  = items.filter(t => ACTIVE_STATUSES.includes(t.status) && !t.isDeleted).length
    const totalPrivate = items.filter(t => t.visibility === 'private').length

    return (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', flexWrap: 'wrap', alignItems: 'center' }}>

                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectSx}>
                    <option value='all'>All Categories</option>
                    {Object.entries(CAT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>

                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectSx}>
                    <option value='all'>All Statuses</option>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>

                <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder='Search title / author…'
                    style={{ ...selectSx, minWidth: 160, color: 'rgba(237,237,237,0.6)' }}
                />

                <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.35)', padding: '5px 9px', cursor: 'pointer', fontSize: '0.65rem' }}>
                    <Refresh style={{ fontSize: 13 }} />
                </button>

                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace', display: 'flex', gap: 10 }}>
                    <span>{totalActive} active</span>
                    {totalPrivate > 0 && <span style={{ color: 'rgba(255,80,80,0.5)' }}>{totalPrivate} private</span>}
                </span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                        <CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.75rem' }}>No tickets found</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                {['Title', 'Type', 'Status', 'Depts', 'Votes', canManage ? 'Actions' : ''].filter(Boolean).map(h => (
                                    <th key={h} style={{ padding: '5px 10px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', textAlign: 'left', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                                <th style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.02)' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {/* Active first */}
                            {active.map(t => <TicketRow key={t._id} t={t} canManage={canManage} isJ4={isJ4} department={department} updatingId={updatingId} transferOpen={transferOpen} transferTarget={transferTarget} transferNote={transferNote} transferring={transferring} onStatusChange={handleStatusChange} onTransferOpen={id => { setTransferOpen(id); setTransferTarget(''); setTransferNote('') }} onTransferClose={() => setTransferOpen(null)} onTransferTargetChange={setTransferTarget} onTransferNoteChange={setTransferNote} onDoTransfer={doTransfer} onView={id => { const rp = returnPath ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''); router.push(`/feedback/${id}?returnTo=${encodeURIComponent(rp)}` as any) }} />)}
                            {/* Inactive separator */}
                            {inactive.length > 0 && active.length > 0 && (
                                <tr><td colSpan={99} style={{ padding: '4px 10px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.2)', background: 'rgba(255,255,255,0.01)', textTransform: 'uppercase' }}>Closed / Resolved</td></tr>
                            )}
                            {inactive.map(t => <TicketRow key={t._id} t={t} canManage={canManage} isJ4={isJ4} department={department} updatingId={updatingId} transferOpen={transferOpen} transferTarget={transferTarget} transferNote={transferNote} transferring={transferring} onStatusChange={handleStatusChange} onTransferOpen={id => { setTransferOpen(id); setTransferTarget(''); setTransferNote('') }} onTransferClose={() => setTransferOpen(null)} onTransferTargetChange={setTransferTarget} onTransferNoteChange={setTransferNote} onDoTransfer={doTransfer} onView={id => { const rp = returnPath ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''); router.push(`/feedback/${id}?returnTo=${encodeURIComponent(rp)}` as any) }} />)}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}


interface RowProps {
    t: TicketItem
    canManage: boolean
    isJ4: boolean
    department: string
    updatingId: string | null
    transferOpen: string | null
    transferTarget: string
    transferNote: string
    transferring: boolean
    onStatusChange: (id: string, s: string) => void
    onTransferOpen: (id: string) => void
    onTransferClose: () => void
    onTransferTargetChange: (v: string) => void
    onTransferNoteChange: (v: string) => void
    onDoTransfer: (id: string) => void
    onView: (id: string) => void
}

function TicketRow({ t, canManage, isJ4, department, updatingId, transferOpen, transferTarget, transferNote, transferring, onStatusChange, onTransferOpen, onTransferClose, onTransferTargetChange, onTransferNoteChange, onDoTransfer, onView }: RowProps) {
    const catMeta    = CAT_META[t.category] ?? CAT_META.request
    const statusMeta = STATUS_META[t.status] ?? STATUS_META.open
    const isUpdating = updatingId === t._id
    const isTransferOpen = transferOpen === t._id
    const ticketDepts = (t.departments?.length ? t.departments : [t.department])

    return (
        <>
            <tr
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: t.isDeleted ? 'rgba(219,0,29,0.03)' : undefined, opacity: t.isDeleted ? 0.6 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                onMouseLeave={e => { e.currentTarget.style.background = t.isDeleted ? 'rgba(219,0,29,0.03)' : 'transparent' }}
            >
                {/* Title */}
                <td style={{ padding: '7px 10px', maxWidth: 260, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {t.visibility === 'private' && <span style={{ fontSize: '0.52rem', fontWeight: 800, color: 'rgba(255,80,80,0.6)', flexShrink: 0 }}>PRV</span>}
                        {t.isDeleted && <span style={{ fontSize: '0.52rem', fontWeight: 800, color: 'rgba(219,0,29,0.6)', flexShrink: 0 }}>DEL</span>}
                        {t.title}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginTop: 1 }}>
                        {t.isAnonymous ? 'Anonymous' : t.authorName} · {new Date(t.createdAt).toLocaleDateString('en-AU', { dateStyle: 'short' })}
                    </div>
                </td>
                {/* Type */}
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: catMeta.color, borderLeft: `2px solid ${catMeta.color}`, paddingLeft: 5 }}>
                        {t.subtype.replace(/-/g, ' ')}
                    </span>
                </td>
                {/* Status */}
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    {canManage ? (
                        <select
                            value={t.status}
                            onChange={e => onStatusChange(t._id, e.target.value)}
                            disabled={isUpdating}
                            style={{ ...{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: statusMeta.color, fontSize: '0.6rem', padding: '3px 6px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0, appearance: 'none', WebkitAppearance: 'none', colorScheme: 'dark' } }}
                        >
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                    ) : (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: statusMeta.color, padding: '2px 6px', border: `1px solid ${statusMeta.color}44` }}>{statusMeta.label}</span>
                    )}
                </td>
                {/* Depts */}
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>
                        {ticketDepts.map(d => DEPT_LABELS[d] ?? d.toUpperCase()).join(', ')}
                    </span>
                </td>
                {/* Votes */}
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, color: t.voteScore > 0 ? 'rgba(74,222,128,0.7)' : t.voteScore < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)' }}>
                        {t.voteScore > 0 ? '+' : ''}{t.voteScore}
                    </span>
                </td>
                {/* Actions */}
                {canManage && (
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                        {isUpdating ? (
                            <CircularProgress size={13} style={{ color: 'rgba(219,0,29,0.5)' }} />
                        ) : (
                            <button
                                onClick={() => isTransferOpen ? onTransferClose() : onTransferOpen(t._id)}
                                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em', color: isTransferOpen ? 'rgba(0,195,255,0.9)' : 'rgba(0,195,255,0.55)', padding: '2px 7px', border: `1px solid ${isTransferOpen ? 'rgba(0,195,255,0.4)' : 'rgba(0,195,255,0.2)'}`, background: isTransferOpen ? 'rgba(0,195,255,0.08)' : 'transparent' }}
                            >
                                <SwapHoriz style={{ fontSize: 12 }} /> Transfer
                            </button>
                        )}
                    </td>
                )}
                {/* View */}
                <td style={{ padding: '7px 10px' }}>
                    <button onClick={() => onView(t._id)} style={{ all: 'unset', cursor: 'pointer', padding: '3px 9px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                        VIEW
                    </button>
                </td>
            </tr>

            {/* Inline transfer row */}
            {isTransferOpen && canManage && (
                <tr style={{ background: 'rgba(0,195,255,0.04)', borderBottom: '1px solid rgba(0,195,255,0.15)' }}>
                    <td colSpan={99} style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(0,195,255,0.7)', letterSpacing: '0.1em' }}>TRANSFER TO:</span>
                            <select
                                value={transferTarget}
                                onChange={e => onTransferTargetChange(e.target.value)}
                                style={{ background: 'rgba(0,195,255,0.06)', border: '1px solid rgba(0,195,255,0.25)', color: 'rgba(237,237,237,0.8)', fontSize: '0.7rem', padding: '4px 8px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0, colorScheme: 'dark' }}
                            >
                                <option value=''>— Select department —</option>
                                {DEPTS.filter(d => !ticketDepts.includes(d)).map(d => (
                                    <option key={d} value={d}>{DEPT_LABELS[d]} — {d.toUpperCase()}</option>
                                ))}
                            </select>
                            <input
                                value={transferNote}
                                onChange={e => onTransferNoteChange(e.target.value)}
                                placeholder='Note (optional)…'
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit', minWidth: 180, colorScheme: 'dark' }}
                            />
                            <button
                                onClick={() => onDoTransfer(t._id)}
                                disabled={!transferTarget || transferring}
                                style={{ all: 'unset', cursor: !transferTarget || transferring ? 'not-allowed' : 'pointer', padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(0,195,255,0.15)', border: '1px solid rgba(0,195,255,0.4)', color: 'rgba(0,195,255,0.9)', opacity: !transferTarget ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
                            >
                                {transferring ? <CircularProgress size={11} color='inherit' /> : 'Confirm Transfer'}
                            </button>
                            <button onClick={onTransferClose} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                Cancel
                            </button>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}
