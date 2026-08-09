'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, Tabs, Tab, CircularProgress, Select, MenuItem, FormControl } from '@mui/material'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'

// ─── Types ────────────────────────────────────────────────────────────────────

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

function formatTs(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

// ─── Discord Log tab ──────────────────────────────────────────────────────────

interface DiscordLogEntry {
    _id: string
    action: string
    status: 'sent' | 'blocked' | 'failed'
    targetUserId: string
    targetUserName: string
    messageType: string
    preview: string
    embeds?: { title?: string; description?: string; fields?: { name: string; value: string }[] }[]
    content?: string
    devMode: boolean
    override: boolean
    createdAt: string
}

const STATUS_COLOURS: Record<string, string> = {
    sent:    'rgba(0,195,100,0.85)',
    blocked: 'rgba(255,180,0,0.85)',
    failed:  'rgba(219,0,29,0.85)',
}

const STATUS_LABELS: Record<string, string> = {
    sent:    'SENT',
    blocked: 'BLOCKED',
    failed:  'FAILED',
}

const MSG_TYPE_LABELS: Record<string, string> = {
    task:     'Task',
    calendar: 'Calendar',
    raw:      'Raw',
    role:     'Role',
    nickname: 'Nickname',
}

function StatusBadge({ status, override }: { status: string; override: boolean }) {
    const colour = STATUS_COLOURS[status] ?? 'rgba(150,150,150,0.8)'
    const label  = override ? 'OVERRIDE' : (STATUS_LABELS[status] ?? status.toUpperCase())
    const badgeColour = override ? 'rgba(88,101,242,0.85)' : colour
    return (
        <span style={{
            fontSize: '0.56rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '2px 6px',
            background: badgeColour.replace('0.85)', '0.12)'),
            color: badgeColour,
            border: `1px solid ${badgeColour.replace('0.85)', '0.3)')}`,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    )
}

function DiscordLogTab() {
    const [logs, setLogs]         = useState<DiscordLogEntry[]>([])
    const [total, setTotal]       = useState(0)
    const [page, setPage]         = useState(1)
    const [status, setStatus]     = useState('')
    const [loading, setLoading]   = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)

    const load = useCallback((p: number, s: string) => {
        setLoading(true)
        const params = new URLSearchParams({ type: 'discord', page: String(p), limit: '50' })
        if (s) params.set('status', s)
        fetch(`/api/admin/logs?${params}`)
            .then(r => r.json())
            .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0) })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load(page, status) }, [load, page, status])

    function handleStatus(s: string) { setStatus(s); setPage(1) }

    const rowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '140px 90px 80px 160px 1fr',
        gap: 12,
        alignItems: 'center',
        padding: '9px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.75rem',
        cursor: 'pointer',
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Filter bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 10px', flexShrink: 0 }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Filter
                </Typography>
                <FormControl size='small' sx={{ minWidth: 130 }}>
                    <Select
                        value={status}
                        onChange={e => handleStatus(e.target.value)}
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
                        <MenuItem value=''         sx={{ fontSize: '0.72rem' }}>All Statuses</MenuItem>
                        <MenuItem value='sent'     sx={{ fontSize: '0.72rem' }}>Sent</MenuItem>
                        <MenuItem value='blocked'  sx={{ fontSize: '0.72rem' }}>Blocked</MenuItem>
                        <MenuItem value='failed'   sx={{ fontSize: '0.72rem' }}>Failed</MenuItem>
                    </Select>
                </FormControl>
                {loading && <CircularProgress size={14} style={{ color: 'var(--red)' }} />}
            </div>

            {/* Header */}
            <div style={{ ...rowStyle, cursor: 'default', background: 'rgba(219,0,29,0.06)', borderBottom: '1px solid rgba(219,0,29,0.2)', color: 'rgba(237,237,237,0.35)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                <span>Timestamp</span>
                <span>Status</span>
                <span>Type</span>
                <span>Recipient</span>
                <span>Preview</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {!loading && logs.length === 0 && (
                    <div style={{ padding: '32px 14px', color: 'rgba(237,237,237,0.25)', fontSize: '0.78rem' }}>
                        No Discord logs found.
                    </div>
                )}
                {logs.map(log => (
                    <div key={log._id}>
                        <div
                            style={{ ...rowStyle, background: expanded === log._id ? 'rgba(88,101,242,0.05)' : 'transparent' }}
                            onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                        >
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatTs(log.createdAt)}
                            </span>
                            <StatusBadge status={log.status} override={log.override} />
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {MSG_TYPE_LABELS[log.messageType] ?? log.messageType}
                            </span>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.72rem', color: '#ededed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {log.targetUserName}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                    {log.targetUserId}
                                </div>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {log.preview}
                            </span>
                        </div>

                        {/* Expanded message detail */}
                        {expanded === log._id && (
                            <div style={{ padding: '10px 14px 14px 14px', background: 'rgba(88,101,242,0.04)', borderBottom: '1px solid rgba(88,101,242,0.12)', borderLeft: '2px solid rgba(88,101,242,0.4)' }}>
                                {log.content && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Content</div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap' }}>{log.content}</div>
                                    </div>
                                )}
                                {log.embeds?.map((embed, i) => (
                                    <div key={i} style={{ marginBottom: 10, paddingLeft: 10, borderLeft: '2px solid rgba(219,0,29,0.4)' }}>
                                        {embed.title && (
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ededed', marginBottom: 4 }}>{embed.title}</div>
                                        )}
                                        {embed.description && (
                                            <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.65)', whiteSpace: 'pre-wrap', marginBottom: 6 }}>{embed.description}</div>
                                        )}
                                        {embed.fields?.map((f, fi) => (
                                            <div key={fi} style={{ marginTop: 4 }}>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(237,237,237,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.name}: </span>
                                                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)' }}>{f.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                {log.devMode && !log.override && (
                                    <div style={{ marginTop: 6, fontSize: '0.62rem', color: 'rgba(255,180,0,0.6)', fontStyle: 'italic' }}>
                                        Blocked by Discord developer mode
                                    </div>
                                )}
                                {log.devMode && log.override && (
                                    <div style={{ marginTop: 6, fontSize: '0.62rem', color: 'rgba(88,101,242,0.7)', fontStyle: 'italic' }}>
                                        Sent via OVERRIDE (developer mode active)
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Pagination page={page} total={total} limit={50} onPage={p => { setPage(p); load(p, status) }} />
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
                    <Tab label='Activity Log'  sx={tabSx} />
                    <Tab label='Errors'       sx={tabSx} />
                    <Tab label='Discord'      sx={tabSx} />
                </Tabs>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {tab === 0 && <ActivityLogTab isJ4={true} />}
                {tab === 1 && <ErrorLogTab />}
                {tab === 2 && <DiscordLogTab />}
            </div>
        </div>
    )
}
