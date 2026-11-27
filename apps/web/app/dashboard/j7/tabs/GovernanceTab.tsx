'use client'

import { useState, useCallback, useEffect } from 'react'
import { Typography, CircularProgress, Chip } from '@mui/material'
import { OpenInNew } from '@mui/icons-material'

type TicketStatus = 'open' | 'in_review' | 'implementing' | 'implemented' | 'broken_mod' | 'resolved' | 'denied' | 'no_action_required' | 'closed'

interface GovTicket {
    _id: string
    title: string
    authorName: string
    category: string
    subtype?: string
    status: TicketStatus
    createdAt: string
    voteScore?: number
    visibility: 'public' | 'private'
}

const CAT_COLOR: Record<string, string> = {
    request: 'rgba(255,160,0,0.85)',
    bug:     'rgba(219,0,29,0.85)',
    mission: 'rgba(0,195,255,0.85)',
    'unit-feedback': 'rgba(74,222,128,0.85)',
}

const STATUS_LABEL: Record<string, string> = {
    open:               'Open',
    in_review:          'In Review',
    implementing:       'Implementing',
    implemented:        'Implemented',
    broken_mod:         'Broken Mod',
    resolved:           'Resolved',
    denied:             'Denied',
    no_action_required: 'No Action',
    closed:             'Closed',
}

const QUEUE_STATUSES: TicketStatus[]    = ['open']
const ACTIVE_STATUSES: TicketStatus[]   = ['in_review', 'implementing']
const RESOLVED_STATUSES: TicketStatus[] = ['implemented', 'resolved', 'denied', 'no_action_required', 'closed', 'broken_mod']

export default function GovernanceTab() {
    const [items, setItems] = useState<GovTicket[]>([])
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState<string | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        fetch('/api/feedback?department=j7')
            .then(r => r.json())
            .then(d => setItems(Array.isArray(d) ? d : []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    async function setStatus(id: string, status: TicketStatus) {
        setUpdating(id)
        try {
            await fetch(`/api/tickets/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            })
            setItems(prev => prev.map(t => t._id === id ? { ...t, status } : t))
        } finally { setUpdating(null) }
    }

    const queue    = items.filter(t => QUEUE_STATUSES.includes(t.status))
    const active   = items.filter(t => ACTIVE_STATUSES.includes(t.status))
    const resolved = items.filter(t => RESOLVED_STATUSES.includes(t.status))

    function TicketRow({ t, actions }: { t: GovTicket; actions: React.ReactNode }) {
        return (
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{t.title}</span>
                        <a href={`/community/tickets/${t._id}`} target='_blank' rel='noreferrer'
                            style={{ color: 'rgba(237,237,237,0.3)', display: 'flex', alignItems: 'center' }}>
                            <OpenInNew sx={{ fontSize: 12 }} />
                        </a>
                        {t.visibility === 'private' && (
                            <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '1px 5px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.7)' }}>Private</span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        {t.authorName} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {t.voteScore !== undefined && t.voteScore !== 0 && (
                            <span style={{ marginLeft: 8, color: t.voteScore > 0 ? 'rgba(74,222,128,0.6)' : 'rgba(219,0,29,0.6)' }}>
                                {t.voteScore > 0 ? '+' : ''}{t.voteScore} votes
                            </span>
                        )}
                    </div>
                </td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', color: CAT_COLOR[t.category] ?? 'rgba(237,237,237,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {t.category}
                    </span>
                </td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>
                        {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                </td>
                <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {updating === t._id ? <CircularProgress size={14} style={{ color: 'var(--red)' }} /> : actions}
                    </div>
                </td>
            </tr>
        )
    }

    function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'green' | 'red' | 'blue' | 'neutral' }) {
        const colors: Record<string, { bg: string; border: string; color: string }> = {
            green:   { bg: 'rgba(46,125,50,0.1)',   border: 'rgba(46,125,50,0.35)',  color: 'rgba(100,220,100,0.8)' },
            red:     { bg: 'rgba(219,0,29,0.08)',    border: 'rgba(219,0,29,0.3)',    color: 'rgba(219,0,29,0.8)' },
            blue:    { bg: 'rgba(0,195,255,0.08)',   border: 'rgba(0,195,255,0.3)',   color: 'rgba(0,195,255,0.8)' },
            neutral: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)' },
        }
        const c = colors[tone]
        return (
            <button onClick={onClick} style={{
                all: 'unset', cursor: 'pointer', padding: '3px 10px',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: c.bg, border: `1px solid ${c.border}`, color: c.color,
            }}>
                {label}
            </button>
        )
    }

    function Section({ title, badge, rows }: { title: string; badge?: number; rows: React.ReactNode[] }) {
        if (rows.length === 0) return null
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3}
                        style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        {title}
                    </Typography>
                    {badge !== undefined && badge > 0 && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.8)' }}>
                            {badge}
                        </span>
                    )}
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Ticket', 'Category', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
            </div>
        )
    }

    if (loading) return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} style={{ color: 'var(--red)' }} />
        </div>
    )

    const totalNeedingAction = queue.length

    return (
        <div style={{ padding: '32px 40px', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                    Website Governance
                </Typography>
                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                    Review incoming tickets for J7. Approve work by moving it to <em>In Review</em>, mark it as implementing when development starts, or deny requests that fall outside scope.
                </Typography>
            </div>

            {totalNeedingAction === 0 && queue.length === 0 && active.length === 0 && resolved.length === 0 && (
                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                    No tickets in the J7 queue.
                </Typography>
            )}

            <Section
                title='Needs Review'
                badge={queue.length}
                rows={queue.map(t => (
                    <TicketRow key={t._id} t={t} actions={
                        <>
                            <ActionBtn label='Approve'  onClick={() => setStatus(t._id, 'in_review')}  tone='blue' />
                            <ActionBtn label='Deny'     onClick={() => setStatus(t._id, 'denied')}     tone='red' />
                            <ActionBtn label='No Action' onClick={() => setStatus(t._id, 'no_action_required')} />
                        </>
                    } />
                ))}
            />

            <Section
                title='In Development'
                rows={active.map(t => (
                    <TicketRow key={t._id} t={t} actions={
                        <>
                            {t.status === 'in_review' && (
                                <ActionBtn label='Start Dev' onClick={() => setStatus(t._id, 'implementing')} tone='blue' />
                            )}
                            <ActionBtn label='Implemented' onClick={() => setStatus(t._id, 'implemented')} tone='green' />
                            <ActionBtn label='Deny'        onClick={() => setStatus(t._id, 'denied')}       tone='red' />
                        </>
                    } />
                ))}
            />

            <Section
                title='Resolved'
                rows={resolved.slice(0, 20).map(t => (
                    <TicketRow key={t._id} t={t} actions={
                        <ActionBtn label='Re-open' onClick={() => setStatus(t._id, 'open')} />
                    } />
                ))}
            />
        </div>
    )
}
