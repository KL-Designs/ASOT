'use client'

import { useState, useEffect, useCallback } from 'react'
import { TextField, Button, Typography, Chip, Alert, CircularProgress } from '@mui/material'
import { Send, CheckCircle, Cancel } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type LoaRow = MemberLoa & { _id: string }

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
}

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0, fontSize: '0.82rem',
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
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase' as const, color: 'rgba(219,0,29,0.7)', marginBottom: 12,
}

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem',
    fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)',
}

const tdStyle: React.CSSProperties = { padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }

export default function LoaTab({ userId }: { userId: string }) {
    const [myLoas, setMyLoas] = useState<LoaRow[]>([])
    const [incoming, setIncoming] = useState<LoaRow[]>([])
    const [loading, setLoading] = useState(true)

    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    const [reviewingId, setReviewingId] = useState<string | null>(null)
    const [reviewNote, setReviewNote] = useState('')
    const [reviewing, setReviewing] = useState(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [mine, inc] = await Promise.all([
                fetch('/api/loa?mode=mine').then(r => r.json()),
                fetch('/api/loa?mode=incoming').then(r => r.json()),
            ])
            setMyLoas(mine.loas ?? [])
            setIncoming(inc.loas ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    async function handleSubmit() {
        if (!startDate || !endDate || !reason.trim()) return
        setSubmitting(true); setSubmitError(null); setSubmitSuccess(null)
        try {
            const res = await fetch('/api/loa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate, reason: reason.trim() }),
            })
            const data = await res.json()
            if (!res.ok) { setSubmitError(data.error || 'Failed to submit'); return }
            setStartDate(''); setEndDate(''); setReason('')
            setSubmitSuccess('LOA request submitted. Your section leader will be notified.')
            fetchAll()
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 6000)
        }
    }

    async function handleReview(id: string, decision: 'approve' | 'reject') {
        setReviewing(true)
        try {
            const res = await fetch(`/api/loa/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, reviewNote: reviewNote.trim() || undefined }),
            })
            if (res.ok) { setReviewingId(null); setReviewNote(''); fetchAll() }
        } finally { setReviewing(false) }
    }

    const hasPending = myLoas.some(l => l.status === 'pending')
    const canSubmit = !submitting && !!startDate && !!endDate && !!reason.trim() && !hasPending

    return (
        <div className='p-6 flex flex-col gap-5'>
            {/* Submit form */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Submit Leave of Absence</Typography>
                {hasPending && (
                    <Alert severity='info' sx={{ borderRadius: 0, fontSize: '0.8rem', mb: 2 }}>
                        You already have a pending LOA request. Wait for it to be reviewed.
                    </Alert>
                )}
                <div className='flex flex-col gap-4'>
                    <div className='flex gap-4 flex-wrap'>
                        <TextField label='Start Date' type='date' size='small' InputLabelProps={{ shrink: true }}
                            value={startDate} onChange={e => setStartDate(e.target.value)}
                            sx={{ maxWidth: 200, ...inputSx }} disabled={hasPending} />
                        <TextField label='End Date' type='date' size='small' InputLabelProps={{ shrink: true }}
                            value={endDate} onChange={e => setEndDate(e.target.value)}
                            sx={{ maxWidth: 200, ...inputSx }} disabled={hasPending} />
                    </div>
                    <TextField label='Reason' size='small' multiline rows={3} fullWidth
                        value={reason} onChange={e => setReason(e.target.value)}
                        sx={inputSx} disabled={hasPending} />
                    {submitError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{submitError}</Alert>}
                    {submitSuccess && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{submitSuccess}</Alert>}
                    <div>
                        <Button variant='outlined' size='small'
                            startIcon={submitting ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 14 }} />}
                            disabled={!canSubmit} onClick={handleSubmit}
                            sx={{ borderRadius: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' }, '&:disabled': { opacity: 0.4 } }}>
                            {submitting ? 'Submitting…' : 'Submit LOA Request'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Incoming requests (section leader view) */}
            {incoming.length > 0 && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>Pending Approvals — Your Section</Typography>
                    {loading ? <TacticalSkeleton rows={3} className='px-4' /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {incoming.filter(l => l.status === 'pending').map(l => (
                                <div key={l._id} style={{ border: '1px solid rgba(219,0,29,0.18)', padding: '14px 16px' }}>
                                    <div className='flex justify-between items-start gap-4 flex-wrap'>
                                        <div>
                                            <Typography style={{ fontSize: '0.82rem', fontWeight: 700 }}>{l.userName}</Typography>
                                            <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', marginTop: 2 }}>
                                                {formatDate(l.startDate)} → {formatDate(l.endDate)}
                                            </Typography>
                                            <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.65)', marginTop: 4 }}>{l.reason}</Typography>
                                        </div>
                                        <div>
                                            {reviewingId === l._id ? (
                                                <div className='flex flex-col gap-2'>
                                                    <TextField label='Review note (optional)' size='small' sx={{ maxWidth: 280, ...inputSx }}
                                                        value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                                                    <div className='flex gap-2'>
                                                        <Button size='small' variant='contained' color='success' disabled={reviewing}
                                                            startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                                                            onClick={() => handleReview(l._id, 'approve')}
                                                            sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700 }}>
                                                            Approve
                                                        </Button>
                                                        <Button size='small' variant='contained' color='error' disabled={reviewing}
                                                            startIcon={<Cancel sx={{ fontSize: 14 }} />}
                                                            onClick={() => handleReview(l._id, 'reject')}
                                                            sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700 }}>
                                                            Reject
                                                        </Button>
                                                        <Button size='small' variant='text' onClick={() => { setReviewingId(null); setReviewNote('') }}
                                                            sx={{ borderRadius: 0, fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <Button size='small' variant='outlined' onClick={() => setReviewingId(l._id)}
                                                    sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' } }}>
                                                    Review
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* My LOA history */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>My Leave History</Typography>
                {loading ? <TacticalSkeleton rows={4} className='px-4' /> : myLoas.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No leave requests submitted yet.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                    {['From', 'To', 'Reason', 'Approver', 'Status', 'Review Note'].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {myLoas.map(l => (
                                    <tr key={l._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={tdStyle}>{formatDate(l.startDate)}</td>
                                        <td style={tdStyle}>{formatDate(l.endDate)}</td>
                                        <td style={{ ...tdStyle, maxWidth: 220 }}>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</span>
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{l.requiredApproverName ?? 'J4 Admin'}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Chip label={l.status} color={STATUS_COLORS[l.status] ?? 'default'} size='small'
                                                sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }} />
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{l.reviewNote || '—'}</td>
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
