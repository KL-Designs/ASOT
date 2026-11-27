'use client'

import { useState, useEffect, useCallback } from 'react'
import { TextField, Button, Chip, CircularProgress, Typography, Alert } from '@mui/material'
import { Send } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type TicketRow = Ticket & { _id: string }

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error'> = {
    open: 'warning',
    actioned: 'success',
    rejected: 'error',
}

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.12)',
    background: 'rgba(255,255,255,0.015)',
    padding: '20px 24px',
}

const labelStyle = {
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(219,0,29,0.7)',
    marginBottom: 12,
}

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 12px',
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(237,237,237,0.35)',
}

const tdStyle: React.CSSProperties = { padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }

export default function NameChangeTab({ userId }: { userId: string }) {
    const [tickets, setTickets] = useState<TicketRow[]>([])
    const [loading, setLoading] = useState(true)

    const [requestedName, setRequestedName] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    const fetchTickets = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/tickets?issuedById=${userId}`)
            const data = await res.json()
            setTickets((data.tickets ?? []).filter((t: TicketRow) => t.type === 'name-change'))
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { fetchTickets() }, [fetchTickets])

    async function handleSubmit() {
        if (!requestedName.trim()) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)
        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'name-change',
                    requestedName: requestedName.trim(),
                    notes: notes.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) { setSubmitError(data.error || 'Failed to submit request'); return }
            setRequestedName('')
            setNotes('')
            setSubmitSuccess('Name change request submitted. Awaiting review by J4 Administration.')
            fetchTickets()
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 6000)
        }
    }

    const hasPending = tickets.some(t => t.status === 'open')
    const canSubmit = !submitting && !!requestedName.trim() && !hasPending

    return (
        <div className='p-6 flex flex-col gap-5'>
            <div style={cardStyle}>
                <Typography style={labelStyle}>Request Callsign Change</Typography>
                <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', marginBottom: 16 }}>
                    Submit a request to change your in-game callsign. J4 Administration will review and approve or reject the request.
                </Typography>
                {hasPending && (
                    <Alert severity='info' sx={{ borderRadius: 0, fontSize: '0.8rem', mb: 2 }}>
                        You already have a pending name change request. Wait for it to be reviewed before submitting another.
                    </Alert>
                )}
                <div className='flex flex-col gap-4'>
                    <TextField
                        label='Requested Callsign'
                        size='small'
                        sx={{ maxWidth: 360, ...inputSx }}
                        value={requestedName}
                        onChange={e => setRequestedName(e.target.value)}
                        disabled={hasPending}
                    />
                    <TextField
                        label='Notes / Reason (optional)'
                        size='small'
                        fullWidth
                        multiline
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        sx={inputSx}
                        disabled={hasPending}
                    />
                    {submitError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{submitError}</Alert>}
                    {submitSuccess && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{submitSuccess}</Alert>}
                    <div>
                        <Button
                            variant='outlined'
                            size='small'
                            startIcon={submitting ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 14 }} />}
                            disabled={!canSubmit}
                            onClick={handleSubmit}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                borderColor: 'rgba(219,0,29,0.27)',
                                color: 'var(--red)',
                                '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                '&:disabled': { opacity: 0.4 },
                            }}
                        >
                            {submitting ? 'Submitting…' : 'Submit Request'}
                        </Button>
                    </div>
                </div>
            </div>

            <div style={cardStyle}>
                <Typography style={labelStyle}>My Requests</Typography>
                {loading ? (
                    <TacticalSkeleton rows={3} className='px-4' />
                ) : tickets.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No name change requests submitted yet.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                    {['From', 'To', 'Status', 'Notes', 'Date'].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map(t => (
                                    <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{t.currentName ?? '—'}</td>
                                        <td style={tdStyle}>{t.requestedName}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Chip
                                                label={t.status}
                                                color={STATUS_COLORS[t.status] ?? 'default'}
                                                size='small'
                                                sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }}
                                            />
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>
                                            {t.actionNotes || t.notes || '—'}
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatDate(t.issuedAt)}</td>
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
