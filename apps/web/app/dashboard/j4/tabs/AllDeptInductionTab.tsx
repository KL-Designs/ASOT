'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, CircularProgress, Alert, Autocomplete, TextField } from '@mui/material'
import { CheckCircle, Send, ExpandMore, ExpandLess } from '@mui/icons-material'

const DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']
const DEPT_LABEL: Record<string, string> = {
    j1: 'J1 — Personnel', j2: 'J2 — Intelligence', j3: 'J3 — Training',
    j4: 'J4 — Administration', j5: 'J5 — Public Affairs', j6: 'J6 — Communications', j7: 'J7 — Development',
}

interface DeptStat {
    dept: string
    total: number
    completed: number
    pending: number
    lastTriggeredAt: string | null
}

interface InductionRow {
    _id: string
    userId: string
    userName: string
    context: string
    triggerLabel?: string
    triggeredByName: string
    triggeredAt: string
    completedAt?: string
}

interface MemberOption { id: string; label: string }

function DeptInductionDetail({ dept, onSent }: { dept: string; onSent: () => void }) {
    const [records, setRecords]       = useState<InductionRow[]>([])
    const [loading, setLoading]       = useState(true)
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [memberSearch, setMemberSearch]   = useState('')
    const [selected, setSelected]           = useState<MemberOption | null>(null)
    const [context, setContext]             = useState('')
    const [triggerLabel, setTriggerLabel]   = useState('')
    const [sending, setSending]             = useState(false)
    const [sendError, setSendError]         = useState<string | null>(null)
    const [sendOk, setSendOk]               = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        fetch(`/api/admin/dept-induction?dept=${dept}`)
            .then(r => r.json())
            .then(d => setRecords(d.records ?? []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [dept])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (!memberSearch.trim()) { setMemberOptions([]); return }
        const t = setTimeout(() => {
            fetch(`/api/admin/members?search=${encodeURIComponent(memberSearch)}&limit=15`)
                .then(r => r.json())
                .then(d => setMemberOptions((d.members ?? []).map((m: { id: string; name?: string; username?: string }) => ({
                    id: m.id, label: m.name || m.username || m.id,
                }))))
                .catch(() => {})
        }, 250)
        return () => clearTimeout(t)
    }, [memberSearch])

    async function handleSend() {
        if (!selected || !context.trim()) return
        setSending(true); setSendError(null); setSendOk(false)
        try {
            const res = await fetch('/api/admin/dept-induction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dept, userId: selected.id, userName: selected.label, context: context.trim(), triggerLabel: triggerLabel.trim() || undefined }),
            })
            const data = await res.json()
            if (!res.ok) { setSendError(data.error || 'Failed'); return }
            setSendOk(true)
            setSelected(null); setMemberSearch(''); setContext(''); setTriggerLabel('')
            setTimeout(() => setSendOk(false), 3000)
            load(); onSent()
        } finally { setSending(false) }
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0, fontSize: '0.8rem',
            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
            '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.76rem', color: 'rgba(237,237,237,0.4)' },
        '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)' },
    }

    return (
        <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Send form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                    Send Induction
                </Typography>
                {sendError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem', py: 0 }}>{sendError}</Alert>}
                {sendOk && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.78rem', py: 0 }} icon={<CheckCircle sx={{ fontSize: 16 }} />}>Induction sent.</Alert>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'flex-start' }}>
                    <Autocomplete
                        options={memberOptions}
                        value={selected}
                        onChange={(_, v) => setSelected(v)}
                        inputValue={memberSearch}
                        onInputChange={(_, v) => setMemberSearch(v)}
                        getOptionLabel={o => o.label}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        noOptionsText={memberSearch ? 'No members found' : 'Type to search…'}
                        renderInput={params => <TextField {...params} label='Member' size='small' sx={inputSx} />}
                    />
                    <TextField label='Context' size='small' value={context} onChange={e => setContext(e.target.value)}
                        placeholder='e.g. j4-appointment' sx={inputSx} />
                    <TextField label='Label (optional)' size='small' value={triggerLabel} onChange={e => setTriggerLabel(e.target.value)}
                        placeholder='e.g. Appointed to J4' sx={inputSx} />
                </div>
                <div>
                    <button disabled={sending || !selected || !context.trim()} onClick={handleSend} style={{
                        all: 'unset', cursor: (sending || !selected || !context.trim()) ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 16px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)',
                        color: (sending || !selected || !context.trim()) ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                    }}>
                        {sending ? <CircularProgress size={11} style={{ color: 'var(--red)' }} /> : <Send sx={{ fontSize: 12 }} />}
                        {sending ? 'Sending…' : 'Send Induction'}
                    </button>
                </div>
            </div>

            {/* History */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Induction History
                </Typography>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                        <CircularProgress size={16} style={{ color: 'var(--red)' }} />
                    </div>
                ) : records.length === 0 ? (
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>
                        No inductions sent for {dept.toUpperCase()} yet.
                    </Typography>
                ) : (
                    <div style={{ border: '1px solid rgba(255,255,255,0.07)', maxHeight: 280, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0d0d0d' }}>
                                    {['Member', 'Context', 'Triggered by', 'Date', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => (
                                    <tr key={r._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '7px 10px', fontSize: '0.76rem', color: 'rgba(237,237,237,0.8)' }}>{r.userName}</td>
                                        <td style={{ padding: '7px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)' }}>{r.triggerLabel || r.context}</td>
                                        <td style={{ padding: '7px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)' }}>{r.triggeredByName}</td>
                                        <td style={{ padding: '7px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>
                                            {new Date(r.triggeredAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td style={{ padding: '7px 10px' }}>
                                            <span style={{
                                                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em',
                                                padding: '2px 7px',
                                                background: r.completedAt ? 'rgba(46,125,50,0.15)' : 'rgba(237,108,2,0.1)',
                                                color: r.completedAt ? 'rgba(100,220,100,0.8)' : 'rgba(255,167,38,0.8)',
                                                border: `1px solid ${r.completedAt ? 'rgba(46,125,50,0.3)' : 'rgba(237,108,2,0.3)'}`,
                                            }}>
                                                {r.completedAt ? 'Completed' : 'Pending'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function AllDeptInductionTab() {
    const [stats, setStats]       = useState<DeptStat[]>([])
    const [loading, setLoading]   = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)

    const loadStats = useCallback(() => {
        setLoading(true)
        fetch('/api/admin/all-dept-inductions')
            .then(r => r.json())
            .then(d => setStats(d.stats ?? []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { loadStats() }, [loadStats])

    function toggle(dept: string) {
        setExpanded(prev => prev === dept ? null : dept)
    }

    if (loading) return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} style={{ color: 'var(--red)' }} />
        </div>
    )

    return (
        <div style={{ padding: '32px 40px', maxWidth: 860 }}>
            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                All-Department Induction Administration
            </Typography>
            <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.4)', lineHeight: 1.6, marginBottom: 28 }}>
                Manage inductions across all departments from one place. Expand a department to view its history or send a new induction.
                Global induction content is managed under <em>Staff Induction Content</em> above.
            </Typography>

            {/* Per-department summary rows */}
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 40px', padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Department', 'Total', 'Completed', 'Pending', 'Last Induction', ''].map(h => (
                        <span key={h} style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</span>
                    ))}
                </div>

                {(stats.length > 0 ? stats : DEPTS.map(d => ({ dept: d, total: 0, completed: 0, pending: 0, lastTriggeredAt: null }))).map(row => (
                    <div key={row.dept}>
                        {/* Summary row */}
                        <div
                            onClick={() => toggle(row.dept)}
                            style={{
                                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 40px',
                                padding: '10px 16px',
                                borderBottom: expanded === row.dept ? 'none' : '1px solid rgba(255,255,255,0.04)',
                                background: expanded === row.dept ? 'rgba(219,0,29,0.04)' : 'transparent',
                                cursor: 'pointer',
                                transition: 'background 0.12s',
                            }}
                        >
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: expanded === row.dept ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.85)' }}>
                                {DEPT_LABEL[row.dept] ?? row.dept.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.76rem', color: 'rgba(237,237,237,0.6)' }}>{row.total}</span>
                            <span style={{ fontSize: '0.76rem', color: row.completed > 0 ? 'rgba(100,220,100,0.7)' : 'rgba(237,237,237,0.3)' }}>
                                {row.completed}
                            </span>
                            <span style={{ fontSize: '0.76rem', color: row.pending > 0 ? 'rgba(255,167,38,0.8)' : 'rgba(237,237,237,0.3)' }}>
                                {row.pending}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>
                                {row.lastTriggeredAt
                                    ? new Date(row.lastTriggeredAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—'
                                }
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: 'rgba(237,237,237,0.3)' }}>
                                {expanded === row.dept
                                    ? <ExpandLess sx={{ fontSize: 16 }} />
                                    : <ExpandMore sx={{ fontSize: 16 }} />
                                }
                            </span>
                        </div>

                        {/* Expandable detail */}
                        {expanded === row.dept && (
                            <DeptInductionDetail dept={row.dept} onSent={loadStats} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
