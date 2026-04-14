'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, Tabs, Tab, CircularProgress, Select, MenuItem, FormControl } from '@mui/material'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionLogEntry {
    _id: string
    action: string
    category: string
    performedBy: string
    performedByName: string
    target?: string
    details?: Record<string, unknown>
    createdAt: string
}

interface ErrorLogEntry {
    _id: string
    path: string
    method: string
    message: string
    stack?: string
    userId?: string
    userDisplayName?: string
    createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
    orbat:     'rgba(255,165,0,0.8)',
    calendar:  'rgba(100,160,255,0.8)',
    member:    'rgba(0,195,100,0.8)',
    operation: 'rgba(200,100,255,0.8)',
    system:    'rgba(150,150,150,0.8)',
}

const CATEGORY_LABELS: Record<string, string> = {
    orbat:     'ORBAT',
    calendar:  'CALENDAR',
    member:    'MEMBER',
    operation: 'OPERATION',
    system:    'SYSTEM',
}

const ACTION_LABELS: Record<string, string> = {
    'orbat.assign':          'Assigned Member',
    'orbat.unassign':        'Unassigned Member',
    'orbat.rename_role':     'Renamed Role',
    'orbat.delete_position': 'Deleted Position',
    'orbat.create_section':  'Created Section',
    'orbat.rename_section':  'Renamed Section',
    'orbat.reorder_section': 'Reordered Section',
    'orbat.delete_section':  'Deleted Section',
    'calendar.create':       'Created Event',
    'calendar.delete':       'Deleted Event',
    'member.reinstate':      'Reinstated Member',
}

function formatTs(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CategoryBadge({ category }: { category: string }) {
    const colour = CATEGORY_COLOURS[category] ?? 'rgba(150,150,150,0.8)'
    const label  = CATEGORY_LABELS[category]  ?? category.toUpperCase()
    return (
        <span style={{
            fontSize: '0.56rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '2px 6px',
            background: colour.replace('0.8)', '0.12)'),
            color: colour,
            border: `1px solid ${colour.replace('0.8)', '0.3)')}`,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    )
}

function MethodBadge({ method }: { method: string }) {
    const colours: Record<string, string> = { GET: '#4caf50', POST: '#2196f3', PATCH: '#ff9800', DELETE: '#f44336' }
    const colour = colours[method] ?? '#aaa'
    return (
        <span style={{
            fontSize: '0.56rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '2px 6px',
            background: `${colour}22`,
            color: colour,
            border: `1px solid ${colour}55`,
            whiteSpace: 'nowrap',
        }}>
            {method}
        </span>
    )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (n: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / limit))
    if (pages <= 1) return null
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', justifyContent: 'center' }}>
            <button
                onClick={() => onPage(page - 1)}
                disabled={page <= 1}
                style={{ background: 'none', border: '1px solid rgba(219,0,29,0.3)', color: page <= 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', padding: '4px 10px', cursor: page <= 1 ? 'default' : 'pointer', fontSize: '0.72rem' }}
            >
                ‹ Prev
            </button>
            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                {page} / {pages} &nbsp;({total.toLocaleString()} entries)
            </span>
            <button
                onClick={() => onPage(page + 1)}
                disabled={page >= pages}
                style={{ background: 'none', border: '1px solid rgba(219,0,29,0.3)', color: page >= pages ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', padding: '4px 10px', cursor: page >= pages ? 'default' : 'pointer', fontSize: '0.72rem' }}
            >
                Next ›
            </button>
        </div>
    )
}

// ─── Action Log tab ───────────────────────────────────────────────────────────

function ActionLogTab() {
    const [logs, setLogs]       = useState<ActionLogEntry[]>([])
    const [total, setTotal]     = useState(0)
    const [page, setPage]       = useState(1)
    const [category, setCategory] = useState('')
    const [loading, setLoading] = useState(true)

    const load = useCallback((p: number, cat: string) => {
        setLoading(true)
        const params = new URLSearchParams({ type: 'action', page: String(p), limit: '50' })
        if (cat) params.set('category', cat)
        fetch(`/api/admin/logs?${params}`)
            .then(r => r.json())
            .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0) })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load(page, category) }, [load, page, category])

    function handleCategory(cat: string) {
        setCategory(cat)
        setPage(1)
    }

    const rowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '140px 80px 160px 1fr 130px',
        gap: 12,
        alignItems: 'center',
        padding: '9px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.75rem',
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Filter bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 10px', flexShrink: 0 }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Filter
                </Typography>
                <FormControl size='small' sx={{ minWidth: 140 }}>
                    <Select
                        value={category}
                        onChange={e => handleCategory(e.target.value)}
                        displayEmpty
                        sx={{
                            fontSize: '0.72rem',
                            color: '#ededed',
                            background: 'rgba(255,255,255,0.04)',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(219,0,29,0.25)' },
                            '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
                        }}
                        MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}
                    >
                        <MenuItem value=''        sx={{ fontSize: '0.72rem' }}>All Categories</MenuItem>
                        <MenuItem value='orbat'   sx={{ fontSize: '0.72rem' }}>ORBAT</MenuItem>
                        <MenuItem value='calendar'sx={{ fontSize: '0.72rem' }}>Calendar</MenuItem>
                        <MenuItem value='member'  sx={{ fontSize: '0.72rem' }}>Member</MenuItem>
                        <MenuItem value='operation' sx={{ fontSize: '0.72rem' }}>Operation</MenuItem>
                        <MenuItem value='system'  sx={{ fontSize: '0.72rem' }}>System</MenuItem>
                    </Select>
                </FormControl>
                {loading && <CircularProgress size={14} style={{ color: 'var(--red)' }} />}
            </div>

            {/* Header */}
            <div style={{ ...rowStyle, background: 'rgba(219,0,29,0.06)', borderBottom: '1px solid rgba(219,0,29,0.2)', color: 'rgba(237,237,237,0.35)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                <span>Timestamp</span>
                <span>Category</span>
                <span>Action</span>
                <span>Details</span>
                <span>Performed By</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {!loading && logs.length === 0 && (
                    <div style={{ padding: '32px 14px', color: 'rgba(237,237,237,0.25)', fontSize: '0.78rem' }}>
                        No action logs found.
                    </div>
                )}
                {logs.map(log => (
                    <div key={log._id} style={{ ...rowStyle, color: 'rgba(237,237,237,0.75)' }}>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatTs(log.createdAt)}
                        </span>
                        <CategoryBadge category={log.category} />
                        <span style={{ fontSize: '0.72rem', color: '#ededed' }}>
                            {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        <span style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(237,237,237,0.6)' }}>
                            {log.target ?? '—'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.performedByName}
                        </span>
                    </div>
                ))}
            </div>

            <Pagination page={page} total={total} limit={50} onPage={p => { setPage(p); load(p, category) }} />
        </div>
    )
}

// ─── Error Log tab ────────────────────────────────────────────────────────────

function ErrorLogTab() {
    const [logs, setLogs]       = useState<ErrorLogEntry[]>([])
    const [total, setTotal]     = useState(0)
    const [page, setPage]       = useState(1)
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)

    const load = useCallback((p: number) => {
        setLoading(true)
        fetch(`/api/admin/logs?type=error&page=${p}&limit=50`)
            .then(r => r.json())
            .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0) })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load(page) }, [load, page])

    const rowStyle: React.CSSProperties = {
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.75rem',
        cursor: 'pointer',
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 10px', flexShrink: 0 }}>
                {loading && <CircularProgress size={14} style={{ color: 'var(--red)' }} />}
                {!loading && (
                    <Typography fontSize='0.62rem' style={{ color: 'rgba(237,237,237,0.3)' }}>
                        {total.toLocaleString()} error{total !== 1 ? 's' : ''} recorded
                    </Typography>
                )}
            </div>

            {/* Header */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '140px 60px 1fr 120px',
                gap: 12,
                padding: '9px 14px',
                background: 'rgba(219,0,29,0.06)',
                borderBottom: '1px solid rgba(219,0,29,0.2)',
                color: 'rgba(237,237,237,0.35)',
                fontSize: '0.58rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
            }}>
                <span>Timestamp</span>
                <span>Method</span>
                <span>Path / Message</span>
                <span>User</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {!loading && logs.length === 0 && (
                    <div style={{ padding: '32px 14px', color: 'rgba(237,237,237,0.25)', fontSize: '0.78rem' }}>
                        No errors logged.
                    </div>
                )}
                {logs.map(log => (
                    <div key={log._id}>
                        <div
                            style={{
                                ...rowStyle,
                                display: 'grid',
                                gridTemplateColumns: '140px 60px 1fr 120px',
                                gap: 12,
                                alignItems: 'center',
                                background: expanded === log._id ? 'rgba(219,0,29,0.06)' : 'transparent',
                            }}
                            onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                        >
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatTs(log.createdAt)}
                            </span>
                            <MethodBadge method={log.method} />
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(200,80,80,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {log.message}
                                </div>
                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                    {log.path}
                                </div>
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {log.userDisplayName ?? log.userId ?? '—'}
                            </span>
                        </div>
                        {expanded === log._id && log.stack && (
                            <div style={{ padding: '8px 14px 12px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                    {log.stack}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Pagination page={page} total={total} limit={50} onPage={p => { setPage(p); load(p) }} />
        </div>
    )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LogsTab() {
    const [tab, setTab] = useState(0)

    const tabSx = {
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        minHeight: 36,
        padding: '6px 14px',
        color: 'rgba(237,237,237,0.45)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 24px 16px' }}>
            <div style={{ borderBottom: '1px solid rgba(219,0,29,0.25)', marginBottom: 0, flexShrink: 0 }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 36 }}
                >
                    <Tab label='Action Log' sx={tabSx} />
                    <Tab label='Errors'     sx={tabSx} />
                </Tabs>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {tab === 0 && <ActionLogTab />}
                {tab === 1 && <ErrorLogTab />}
            </div>
        </div>
    )
}
