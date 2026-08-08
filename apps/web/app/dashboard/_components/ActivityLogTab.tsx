'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { OpenInNew, InfoOutlined } from '@mui/icons-material'
import { useRouter } from 'next/navigation'

interface Props {
    department?: string     // if set, restrict to this dept (dept-lead view); if not set, show all (J4 global)
    isJ4?: boolean
}

type ActionLog = {
    _id: string
    action: string
    category: string
    performedBy: string
    performedByName: string
    department?: string
    entityType?: string
    entityId?: string
    actionUrl?: string
    target?: string
    before?: unknown
    after?: unknown
    details?: Record<string, unknown>
    createdAt: string
}

const CATEGORY_COLORS: Record<string, string> = {
    meeting:   'rgba(0,195,255,0.7)',
    ticket:    'rgba(219,0,29,0.7)',
    task:      'rgba(255,160,0,0.7)',
    calendar:  'rgba(74,222,128,0.7)',
    member:    'rgba(167,139,250,0.7)',
    orbat:     'rgba(237,237,237,0.5)',
    operation: 'rgba(255,120,0,0.7)',
    discord:   'rgba(88,101,242,0.7)',
    training:  'rgba(0,220,140,0.7)',
    award:     'rgba(255,200,0,0.7)',
    system:    'rgba(237,237,237,0.25)',
    board:     'rgba(0,229,255,0.7)',
}

const ENTITY_TYPES = ['meeting','task','ticket','calendar','member','training','award','role','card','column']
const CATEGORIES   = ['meeting','ticket','task','calendar','member','orbat','operation','discord','training','award','system','board']

const DEPT_NAMES: Record<string, string> = {
    j1:'J1', j2:'J2', j3:'J3', j4:'J4', j5:'J5', j6:'J6', j7:'J7',
}

export default function ActivityLogTab({ department, isJ4 = false }: Props) {
    const router = useRouter()

    const [logs, setLogs]       = useState<ActionLog[]>([])
    const [total, setTotal]     = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage]       = useState(1)
    const [modal, setModal]     = useState<ActionLog | null>(null)

    // Filters
    const [category,   setCategory]   = useState('')
    const [entityType, setEntityType] = useState('')
    const [search,     setSearch]     = useState('')
    const [startDate,  setStartDate]  = useState('')
    const [endDate,    setEndDate]    = useState('')
    const [deptFilter, setDeptFilter] = useState(department ?? '')

    const LIMIT = 50

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
            if (deptFilter)  p.set('department', deptFilter)
            if (category)    p.set('category',   category)
            if (entityType)  p.set('entityType', entityType)
            if (search)      p.set('search',     search)
            if (startDate)   p.set('startDate',  startDate)
            if (endDate)     p.set('endDate',    endDate)
            const res  = await fetch(`/api/admin/activity?${p}`)
            const data = await res.json()
            setLogs(data.logs ?? [])
            setTotal(data.total ?? 0)
        } finally { setLoading(false) }
    }, [page, deptFilter, category, entityType, search, startDate, endDate])

    useEffect(() => { load() }, [load])
    // Reset to page 1 when filters change
    useEffect(() => { setPage(1) }, [deptFilter, category, entityType, search, startDate, endDate])

    function handleClick(log: ActionLog) {
        if (log.actionUrl) {
            router.push(log.actionUrl as any)
        } else {
            setModal(log)
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / LIMIT))

    const selectSx: React.CSSProperties = {
        all: 'unset', fontSize: '0.7rem', color: 'rgba(237,237,237,0.75)',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        padding: '4px 8px', cursor: 'pointer', colorScheme: 'dark',
    }
    const inputSx: React.CSSProperties = {
        all: 'unset', fontSize: '0.7rem', color: 'rgba(237,237,237,0.75)',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        padding: '4px 8px', boxSizing: 'border-box',
    }

    return (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Dept filter — J4 only */}
                {isJ4 && !department && (
                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ ...selectSx, minWidth: 90 }}>
                        <option value=''>All Depts</option>
                        {Object.entries(DEPT_NAMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                )}

                <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...selectSx, minWidth: 110 }}>
                    <option value=''>All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{ ...selectSx, minWidth: 110 }}>
                    <option value=''>All Types</option>
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search member…' style={{ ...inputSx, minWidth: 130 }} />

                <input type='date' value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputSx, colorScheme: 'dark' } as React.CSSProperties} />
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>to</span>
                <input type='date' value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputSx, colorScheme: 'dark' } as React.CSSProperties} />

                <button onClick={() => { setCategory(''); setEntityType(''); setSearch(''); setStartDate(''); setEndDate(''); if (isJ4 && !department) setDeptFilter('') }}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', padding: '4px 8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Clear
                </button>

                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                    {total.toLocaleString()} entries
                </span>
            </div>

            {/* Log table */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                        <CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} />
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.75rem' }}>No activity found</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                {['Time', 'Action', 'Performed By', 'Target', 'Dept', ''].map(h => (
                                    <th key={h} style={{ padding: '5px 10px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', textAlign: 'left', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const color = CATEGORY_COLORS[log.category] ?? 'rgba(237,237,237,0.4)'
                                const hasLink = !!log.actionUrl
                                return (
                                    <tr
                                        key={log._id}
                                        onClick={() => handleClick(log)}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.1s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                    >
                                        <td style={{ padding: '6px 10px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                            {new Date(log.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${color}18`, color, border: `1px solid ${color}44`, fontFamily: 'monospace' }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.7)', whiteSpace: 'nowrap' }}>
                                            {log.performedByName}
                                        </td>
                                        <td style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.target ?? '—'}
                                        </td>
                                        <td style={{ padding: '6px 10px', fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                            {log.department ? (DEPT_NAMES[log.department] ?? log.department) : '—'}
                                        </td>
                                        <td style={{ padding: '6px 10px' }}>
                                            {hasLink
                                                ? <OpenInNew sx={{ fontSize: 12, color: 'rgba(237,237,237,0.2)' }} />
                                                : <InfoOutlined sx={{ fontSize: 12, color: 'rgba(237,237,237,0.15)' }} />
                                            }
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ all: 'unset', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.65rem', padding: '3px 10px', border: '1px solid rgba(255,255,255,0.1)', color: page === 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.55)' }}>
                        Prev
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                        {page} / {totalPages}
                    </span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ all: 'unset', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.65rem', padding: '3px 10px', border: '1px solid rgba(255,255,255,0.1)', color: page === totalPages ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.55)' }}>
                        Next
                    </button>
                </div>
            )}

            {/* Detail modal (for entries without a URL) */}
            {modal && (
                <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.12)', borderTop: '2px solid rgba(219,0,29,0.6)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{modal.action}</span>
                            <button onClick={() => setModal(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>✕</button>
                        </div>
                        {[
                            ['Category', modal.category],
                            ['Performed by', modal.performedByName],
                            ['Department', modal.department ? DEPT_NAMES[modal.department] ?? modal.department : null],
                            ['Entity type', modal.entityType],
                            ['Entity ID', modal.entityId],
                            ['Target', modal.target],
                            ['Time', new Date(modal.createdAt).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'medium' })],
                        ].filter(([, v]) => !!v).map(([k, v]) => (
                            <div key={k as string} style={{ display: 'flex', gap: 12 }}>
                                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', width: 100, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace' }}>{k as string}</span>
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.75)' }}>{v as string}</span>
                            </div>
                        ))}
                        {modal.before !== undefined && (
                            <div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginBottom: 4, letterSpacing: '0.08em', fontFamily: 'monospace' }}>BEFORE → AFTER</div>
                                <pre style={{ margin: 0, fontSize: '0.65rem', color: 'rgba(237,237,237,0.6)', background: 'rgba(255,255,255,0.03)', padding: 8, overflowX: 'auto', maxHeight: 120, fontFamily: 'monospace' }}>
                                    {JSON.stringify(modal.before, null, 2)} → {JSON.stringify(modal.after, null, 2)}
                                </pre>
                            </div>
                        )}
                        {modal.details && Object.keys(modal.details).length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginBottom: 4, letterSpacing: '0.08em', fontFamily: 'monospace' }}>DETAILS</div>
                                <pre style={{ margin: 0, fontSize: '0.65rem', color: 'rgba(237,237,237,0.6)', background: 'rgba(255,255,255,0.03)', padding: 8, overflowX: 'auto', maxHeight: 120, fontFamily: 'monospace' }}>
                                    {JSON.stringify(modal.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
