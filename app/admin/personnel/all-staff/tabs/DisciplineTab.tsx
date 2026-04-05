'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Autocomplete, TextField, Button, Chip, CircularProgress, Typography, Alert,
} from '@mui/material'
import { Send } from '@mui/icons-material'

type TicketRow = Ticket & { _id: string }
type MemberOption = { id: string; displayName: string }

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error'> = {
    open: 'warning',
    actioned: 'success',
    rejected: 'error',
}

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

export default function DisciplineTab({ userId }: { userId: string }) {
    const [members, setMembers] = useState<MemberOption[]>([])
    const [loadingMembers, setLoadingMembers] = useState(true)
    const [myTickets, setMyTickets] = useState<TicketRow[]>([])
    const [loadingTickets, setLoadingTickets] = useState(true)

    // Form state
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [reason, setReason] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    const fetchTickets = useCallback(async () => {
        setLoadingTickets(true)
        try {
            const res = await fetch(`/api/admin/tickets?issuedById=${userId}`)
            const data = await res.json()
            setMyTickets((data.tickets ?? []).filter((t: TicketRow) => t.type === 'discipline'))
        } finally {
            setLoadingTickets(false)
        }
    }, [userId])

    useEffect(() => {
        fetch('/api/admin/members')
            .then(r => r.json())
            .then(d => setMembers(d.members ?? []))
            .finally(() => setLoadingMembers(false))
        fetchTickets()
    }, [fetchTickets])

    async function handleSubmit() {
        if (!selectedMember || !reason.trim()) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)

        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'discipline',
                    targetUserId: selectedMember.id,
                    targetUserName: selectedMember.displayName,
                    disciplineReason: reason.trim(),
                    notes: notes.trim() || undefined,
                }),
            })

            const data = await res.json()
            if (!res.ok) {
                setSubmitError(data.error || 'Failed to submit discipline ticket')
                return
            }

            setSelectedMember(null)
            setReason('')
            setNotes('')
            setSubmitSuccess('Discipline ticket submitted. Awaiting review by J4 Administration.')
            fetchTickets()
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 6000)
        }
    }

    const canSubmit = !submitting && !!selectedMember && !!reason.trim()

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

    const tdStyle: React.CSSProperties = {
        padding: '8px 12px',
        color: 'rgba(237,237,237,0.75)',
    }

    return (
        <div className='p-6 flex flex-col gap-5'>
            {/* Submit Form */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Submit Discipline Ticket</Typography>
                <div className='flex flex-col gap-4'>
                    <Autocomplete
                        options={members}
                        getOptionLabel={m => m.displayName}
                        value={selectedMember}
                        onChange={(_, v) => setSelectedMember(v)}
                        loading={loadingMembers}
                        sx={{ maxWidth: 360, ...inputSx }}
                        renderInput={params => (
                            <TextField {...params} label='Member' size='small' sx={inputSx} />
                        )}
                        size='small'
                    />
                    <TextField
                        label='Reason'
                        size='small'
                        fullWidth
                        multiline
                        rows={3}
                        required
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        sx={inputSx}
                    />
                    <TextField
                        label='Notes (optional)'
                        size='small'
                        fullWidth
                        multiline
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        sx={inputSx}
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
                                borderColor: 'rgba(219,0,29,0.4)',
                                color: 'var(--red)',
                                '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                '&:disabled': { opacity: 0.4 },
                            }}
                        >
                            {submitting ? 'Submitting…' : 'Submit Discipline Ticket'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* My Submitted Tickets */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>My Submitted Tickets</Typography>
                {loadingTickets ? (
                    <div className='flex justify-center py-8'>
                        <CircularProgress size={24} sx={{ color: 'var(--red)' }} />
                    </div>
                ) : myTickets.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No discipline tickets submitted yet.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                                    {['Member', 'Reason', 'Status', 'Points Deducted', 'Date'].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {myTickets.map(t => (
                                    <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={tdStyle}>{t.targetUserName}</td>
                                        <td style={{ ...tdStyle, maxWidth: 300 }}>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.disciplineReason}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Chip
                                                label={t.status}
                                                color={STATUS_COLORS[t.status] ?? 'default'}
                                                size='small'
                                                sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }}
                                            />
                                        </td>
                                        <td style={{ ...tdStyle, color: t.actionedPointsDeducted ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.3)' }}>
                                            {t.actionedPointsDeducted != null ? `-${t.actionedPointsDeducted} pts` : '—'}
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
