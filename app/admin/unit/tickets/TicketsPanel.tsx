'use client'

import { useState, useEffect, useMemo } from 'react'
import {
    Typography, Chip, CircularProgress, Button,
    TextField, Select, MenuItem, FormControl, InputLabel,
    Dialog, DialogContent, DialogTitle, IconButton,
} from '@mui/material'
import { Refresh, Close, ArrowForward } from '@mui/icons-material'

type TicketRow = Ticket & { _id: string }

const DEPT_LABELS: Record<string, string> = {
    j1: 'J1',
    j2: 'J2',
    j3: 'J3',
    j4: 'J4',
    j6: 'J6',
    j7: 'J7',
    allstaff: 'All Staff',
}

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
    '& .MuiSelect-select': { fontSize: '0.82rem' },
}

function Field({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
        <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>
                {label}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)' }}>{value}</div>
        </div>
    )
}

function moveFromLabel(t: TicketRow) {
    if (t.fromIsReservist) return 'Reservist'
    return t.fromSectionTitle ? `${t.fromSectionTitle} / ${t.fromPositionRole}` : (t.fromPositionRole ?? '—')
}

function moveToLabel(t: TicketRow) {
    if (t.toIsReservist) return 'Reservist'
    return t.toSectionTitle ? `${t.toSectionTitle} / ${t.toPositionRole}` : (t.toPositionRole ?? '—')
}

function ActionModal({ ticket, userId, onClose, onResolved }: {
    ticket: TicketRow
    userId: string
    onClose: () => void
    onResolved: (id: string, status: 'actioned' | 'rejected') => void
}) {
    const [decision, setDecision] = useState<'approve' | 'reject'>('approve')
    const [actionNotes, setActionNotes] = useState('')
    const [disciplinePoints, setDisciplinePoints] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isMoveRequest = ticket.type === 'move-request'
    const isDischarge = ticket.type === 'j4-discharge'
    const isDiscipline = ticket.type === 'discipline'
    const isSelfDischarge = isDischarge && ticket.issuedById === userId

    async function handleConfirm() {
        if (isDiscipline && decision === 'approve') {
            const pts = Number(disciplinePoints)
            if (!Number.isFinite(pts) || pts <= 0) {
                setError('Enter a valid positive number of points to deduct.')
                return
            }
        }
        setSubmitting(true)
        setError(null)
        try {
            const body: Record<string, unknown> = { decision, actionNotes: actionNotes.trim() || undefined }
            if (isDiscipline && decision === 'approve') body.disciplinePoints = Number(disciplinePoints)
            const res = await fetch(`/api/admin/tickets/${ticket._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Failed to action ticket')
                return
            }
            onResolved(ticket._id, decision === 'approve' ? 'actioned' : 'rejected')
            onClose()
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open
            onClose={onClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{
                style: {
                    background: '#141414',
                    border: '1px solid rgba(219,0,29,0.2)',
                    borderRadius: 0,
                },
            }}
        >
            <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                <Typography fontWeight={700} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>
                    {isMoveRequest ? 'Action Move Request' : isDischarge ? 'Action Discharge' : isDiscipline ? 'Action Discipline' : 'Action Ticket'}
                </Typography>
                <IconButton onClick={onClose} size='small' sx={{ color: 'rgba(237,237,237,0.5)', '&:hover': { color: 'var(--foreground)' } }}>
                    <Close fontSize='small' />
                </IconButton>
            </DialogTitle>
            <DialogContent style={{ padding: '20px' }}>
                <div className='flex flex-col gap-4'>
                    {/* Ticket details */}
                    <div
                        className='flex flex-col gap-3 p-4'
                        style={{ border: '1px solid rgba(219,0,29,0.1)', background: 'rgba(255,255,255,0.02)' }}
                    >
                        {isMoveRequest ? (
                            <>
                                <div className='grid grid-cols-2 gap-3'>
                                    <Field label='Department' value='All Staff' />
                                    <Field label='Member' value={ticket.targetUserName} />
                                    <Field label='Requested By' value={ticket.issuedByName} />
                                    <Field label='Date' value={formatDate(ticket.issuedAt)} />
                                </div>
                                {/* From → To */}
                                <div
                                    className='flex items-center gap-3 p-3'
                                    style={{ border: '1px solid rgba(219,0,29,0.08)', background: 'rgba(219,0,29,0.03)' }}
                                >
                                    <div className='flex-1'>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>From</div>
                                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)' }}>{moveFromLabel(ticket)}</div>
                                    </div>
                                    <ArrowForward style={{ fontSize: 16, color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                                    <div className='flex-1'>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>To</div>
                                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)' }}>{moveToLabel(ticket)}</div>
                                    </div>
                                </div>
                                {ticket.requiredApproverName && (
                                    <Field label='Required Approver' value={ticket.requiredApproverName} />
                                )}
                                {ticket.notes && <Field label='Notes' value={ticket.notes} />}
                            </>
                        ) : isDiscipline ? (
                            <div className='flex flex-col gap-3'>
                                <div className='grid grid-cols-2 gap-3'>
                                    <Field label='Member' value={ticket.targetUserName} />
                                    <Field label='Submitted By' value={ticket.issuedByName} />
                                    <Field label='Date' value={formatDate(ticket.issuedAt)} />
                                    {ticket.actionedPointsDeducted != null && (
                                        <div>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>Points Deducted</div>
                                            <Chip
                                                label={`-${ticket.actionedPointsDeducted} pts`}
                                                size='small'
                                                sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 18, borderRadius: '2px', background: 'rgba(219,0,29,0.12)', color: 'var(--red)' }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <Field label='Reason' value={ticket.disciplineReason} />
                                {ticket.notes && <Field label='Notes' value={ticket.notes} />}
                            </div>
                        ) : isDischarge ? (
                            <div className='flex flex-col gap-3'>
                                <div className='grid grid-cols-2 gap-3'>
                                    <Field label='Member' value={ticket.targetUserName} />
                                    <Field label='Submitted By' value={ticket.issuedByName} />
                                    <Field label='Date' value={formatDate(ticket.issuedAt)} />
                                    <div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>
                                            Discharge Type
                                        </div>
                                        <Chip
                                            label={ticket.dischargeType === 'honorable' ? 'Honorable' : 'Dishonorable'}
                                            size='small'
                                            sx={{
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                letterSpacing: 1,
                                                height: 18,
                                                borderRadius: '2px',
                                                background: ticket.dischargeType === 'honorable' ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.12)',
                                                color: ticket.dischargeType === 'honorable' ? 'rgb(0,195,100)' : 'var(--red)',
                                            }}
                                        />
                                    </div>
                                </div>
                                <Field label='Reason' value={ticket.dischargeReason} />
                                {ticket.notes && <Field label='Notes' value={ticket.notes} />}
                                {isSelfDischarge && (
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)', padding: '8px 10px', border: '1px solid rgba(219,0,29,0.2)', background: 'rgba(219,0,29,0.05)' }}>
                                        You submitted this request and cannot approve it. Another J4 member must action this ticket.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className='grid grid-cols-2 gap-3'>
                                <Field label='Department' value={DEPT_LABELS[ticket.department] ?? ticket.department} />
                                <Field
                                    label='Action'
                                    value={
                                        ticket.action === 'add' ? 'Add Qualification' :
                                        ticket.action === 'remove' ? 'Remove Qualification' :
                                        ticket.action === 'promote' ? 'Promote' :
                                        ticket.action === 'demote' ? 'Demote' :
                                        ticket.type === 'j4-award' ? 'Award Nomination' : undefined
                                    }
                                />
                                <Field label='Member' value={ticket.targetUserName} />
                                <Field
                                    label={ticket.type === 'j3-promotion' ? 'Proposed Rank' : ticket.type === 'j4-award' ? 'Award' : 'Qualification'}
                                    value={ticket.proposedRank ?? ticket.qualification ?? ticket.awardName}
                                />
                                {ticket.awardType && <Field label='Award Type' value={ticket.awardType} />}
                                <Field label='Issued By' value={ticket.issuedByName} />
                                <Field label='Date Issued' value={formatDate(ticket.issuedAt)} />
                                {ticket.notes && <Field label='Notes' value={ticket.notes} />}
                            </div>
                        )}
                    </div>

                    {/* Decision */}
                    <FormControl size='small' fullWidth sx={inputSx}>
                        <InputLabel>Decision</InputLabel>
                        <Select
                            value={decision}
                            label='Decision'
                            onChange={e => setDecision(e.target.value as 'approve' | 'reject')}
                        >
                            <MenuItem value='approve' sx={{ fontSize: '0.82rem' }}>Approve</MenuItem>
                            <MenuItem value='reject' sx={{ fontSize: '0.82rem' }}>Reject</MenuItem>
                        </Select>
                    </FormControl>

                    {isDiscipline && decision === 'approve' && (
                        <TextField
                            label='Points to Deduct'
                            size='small'
                            type='number'
                            inputProps={{ min: 1, step: 1 }}
                            value={disciplinePoints}
                            onChange={e => setDisciplinePoints(e.target.value)}
                            sx={inputSx}
                            helperText='Number of billet points to subtract from the member'
                            FormHelperTextProps={{ style: { fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', margin: '4px 0 0' } }}
                        />
                    )}

                    <TextField
                        label='Action Notes (optional)'
                        size='small'
                        fullWidth
                        multiline
                        rows={2}
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        sx={inputSx}
                    />

                    {error && (
                        <Typography style={{ fontSize: '0.78rem', color: 'var(--red)' }}>{error}</Typography>
                    )}

                    <div className='flex gap-3 justify-end'>
                        <Button
                            size='small'
                            onClick={onClose}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                color: 'rgba(237,237,237,0.4)',
                                '&:hover': { color: 'rgba(237,237,237,0.7)' },
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant='outlined'
                            size='small'
                            disabled={submitting || (isSelfDischarge && decision === 'approve')}
                            onClick={handleConfirm}
                            sx={{
                                borderRadius: 0,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                borderColor: decision === 'approve' ? 'rgba(0,195,100,0.4)' : 'rgba(219,0,29,0.4)',
                                color: decision === 'approve' ? 'rgb(0,195,100)' : 'var(--red)',
                                '&:hover': {
                                    borderColor: decision === 'approve' ? 'rgb(0,195,100)' : 'var(--red)',
                                    background: decision === 'approve' ? 'rgba(0,195,100,0.06)' : 'rgba(219,0,29,0.06)',
                                },
                                '&:disabled': { opacity: 0.4 },
                            }}
                        >
                            {submitting ? 'Processing…' : decision === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Summary cell for the table — differs by ticket type
function TicketSummaryCell({ t }: { t: TicketRow }) {
    if (t.type === 'move-request') {
        return (
            <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                    <span style={{ color: 'rgba(237,237,237,0.5)' }}>{moveFromLabel(t)}</span>
                    <ArrowForward style={{ fontSize: 12, color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                    <span>{moveToLabel(t)}</span>
                </div>
                {t.requiredApproverName && (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        Approver: {t.requiredApproverName}
                    </div>
                )}
            </td>
        )
    }
    if (t.type === 'j4-discharge') {
        return (
            <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Chip
                        label={t.dischargeType === 'honorable' ? 'Honorable' : 'Dishonorable'}
                        size='small'
                        sx={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: 1,
                            height: 18,
                            borderRadius: '2px',
                            background: t.dischargeType === 'honorable' ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.12)',
                            color: t.dischargeType === 'honorable' ? 'rgb(0,195,100)' : 'var(--red)',
                        }}
                    />
                </div>
                {t.dischargeReason && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.dischargeReason}
                    </div>
                )}
            </td>
        )
    }
    if (t.type === 'discipline') {
        return (
            <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)' }}>
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.disciplineReason}
                </div>
                {t.actionedPointsDeducted != null && (
                    <Chip
                        label={`-${t.actionedPointsDeducted} pts`}
                        size='small'
                        sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, height: 16, borderRadius: '2px', background: 'rgba(219,0,29,0.12)', color: 'var(--red)', marginTop: '3px' }}
                    />
                )}
            </td>
        )
    }
    if (t.type === 'department-membership') {
        const dept = (t.deptCode ?? t.department ?? '').toUpperCase()
        const actionText =
            t.memberAction === 'add' ? `Added to ${dept}` :
            t.memberAction === 'remove' ? `Removed from ${dept}` :
            t.memberAction === 'set-lead' ? `Set as ${dept} Team Lead` :
            t.memberAction === 'remove-lead' ? `Removed as ${dept} Team Lead` :
            dept
        return (
            <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)' }}>
                <div style={{ fontSize: '0.78rem' }}>{actionText}</div>
                {t.actionedByName && (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        Auto-approved
                    </div>
                )}
            </td>
        )
    }
    return (
        <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)' }}>
            {t.qualification ?? t.awardName ?? t.proposedRank ?? '—'}
        </td>
    )
}

function ticketActionLabel(t: TicketRow) {
    if (t.type === 'move-request') return 'Move Request'
    if (t.type === 'j4-discharge') return 'Discharge'
    if (t.type === 'discipline') return 'Discipline'
    if (t.type === 'department-membership') {
        if (t.memberAction === 'add') return 'Add Member'
        if (t.memberAction === 'remove') return 'Remove Member'
        if (t.memberAction === 'set-lead') return 'Set Lead'
        if (t.memberAction === 'remove-lead') return 'Remove Lead'
        return 'Dept Membership'
    }
    if (t.action === 'promote') return 'Promote'
    if (t.action === 'demote') return 'Demote'
    if (t.action) return t.action
    if (t.type === 'j4-award') return 'Nomination'
    return '—'
}

export default function TicketsPanel({
    canActionJ3,
    canActionJ4,
    canActionMoveRequest,
    canActionDiscipline,
    displayName,
    userId,
}: {
    canActionJ3: boolean
    canActionJ4: boolean
    canActionMoveRequest: boolean
    canActionDiscipline: boolean
    displayName: string
    userId: string
}) {
    const [tickets, setTickets] = useState<TicketRow[]>([])
    const [loading, setLoading] = useState(true)
    const [deptFilter, setDeptFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<TicketRow | null>(null)

    async function fetchTickets() {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/tickets')
            const data = await res.json()
            setTickets(data.tickets ?? [])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchTickets() }, [])

    function handleResolved(id: string, status: 'actioned' | 'rejected') {
        setTickets(prev => prev.map(t => t._id === id ? { ...t, status } : t))
    }

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return tickets.filter(t => {
            // Dept-membership tickets are audit records — visible to all admin users
            if (t.type !== 'department-membership') {
                if (t.department === 'j3' && !canActionJ3) return false
                if (t.department === 'j4' && !canActionJ4) return false
                if (t.department === 'allstaff') {
                    const canSee =
                        (t.type === 'move-request' && canActionMoveRequest) ||
                        (t.type === 'discipline' && canActionDiscipline)
                    if (!canSee) return false
                }
            }
            if (deptFilter !== 'all' && t.department !== deptFilter) return false
            if (statusFilter !== 'all' && t.status !== statusFilter) return false
            if (q && ![t.targetUserName, t.qualification, t.issuedByName, t.awardName, t.proposedRank, t.fromSectionTitle, t.toSectionTitle, t.disciplineReason].some(v => v?.toLowerCase().includes(q))) return false
            return true
        })
    }, [tickets, deptFilter, statusFilter, search, canActionJ3, canActionJ4, canActionMoveRequest, canActionDiscipline])

    const canAction = (t: TicketRow) =>
        t.status === 'open' && (
            (canActionJ3 && t.department === 'j3') ||
            (canActionJ4 && t.department === 'j4') ||
            (canActionMoveRequest && t.type === 'move-request') ||
            (canActionDiscipline && t.type === 'discipline')
        )

    const selectSx = { minWidth: 130, ...inputSx }

    return (
        <div className='h-full w-full flex flex-col max-w-[1200px]'>
            {/* Header */}
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Unit
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    Tickets
                </Typography>
            </div>

            {/* Filters */}
            <div className='mx-6 mt-4 flex gap-3 flex-wrap items-center'>
                <TextField
                    size='small'
                    placeholder='Search member, qualification, issuer…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    sx={{ flex: 1, minWidth: 220, ...inputSx }}
                />
                <FormControl size='small' sx={selectSx}>
                    <InputLabel>Department</InputLabel>
                    <Select value={deptFilter} label='Department' onChange={e => setDeptFilter(e.target.value)}>
                        <MenuItem value='all' sx={{ fontSize: '0.82rem' }}>All Departments</MenuItem>
                        <MenuItem value='j1' sx={{ fontSize: '0.82rem' }}>J1 — Recruitment</MenuItem>
                        <MenuItem value='j2' sx={{ fontSize: '0.82rem' }}>J2 — Mission Making</MenuItem>
                        {canActionJ3 && <MenuItem value='j3' sx={{ fontSize: '0.82rem' }}>J3 — Training</MenuItem>}
                        {canActionJ4 && <MenuItem value='j4' sx={{ fontSize: '0.82rem' }}>J4 — Administration</MenuItem>}
                        <MenuItem value='j6' sx={{ fontSize: '0.82rem' }}>J6 — Game Masters</MenuItem>
                        <MenuItem value='j7' sx={{ fontSize: '0.82rem' }}>J7 — Development</MenuItem>
                        {canActionMoveRequest && <MenuItem value='allstaff' sx={{ fontSize: '0.82rem' }}>All Staff — Moves</MenuItem>}
                    </Select>
                </FormControl>
                <FormControl size='small' sx={selectSx}>
                    <InputLabel>Status</InputLabel>
                    <Select value={statusFilter} label='Status' onChange={e => setStatusFilter(e.target.value)}>
                        <MenuItem value='all' sx={{ fontSize: '0.82rem' }}>All Statuses</MenuItem>
                        <MenuItem value='open' sx={{ fontSize: '0.82rem' }}>Open</MenuItem>
                        <MenuItem value='actioned' sx={{ fontSize: '0.82rem' }}>Actioned</MenuItem>
                        <MenuItem value='rejected' sx={{ fontSize: '0.82rem' }}>Rejected</MenuItem>
                    </Select>
                </FormControl>
                <IconButton
                    size='small'
                    onClick={fetchTickets}
                    disabled={loading}
                    sx={{ color: 'rgba(237,237,237,0.4)', '&:hover': { color: 'var(--foreground)' } }}
                >
                    <Refresh fontSize='small' />
                </IconButton>
            </div>

            {/* Table */}
            <div
                className='mx-6 mt-4 mb-6 flex-1 min-h-0'
                style={{ border: '1px solid rgba(219,0,29,0.1)', background: 'rgba(255,255,255,0.01)', overflowX: 'auto' }}
            >
                {loading ? (
                    <div className='flex justify-center py-12'>
                        <CircularProgress size={28} sx={{ color: 'var(--red)' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '32px 24px' }}>
                        No tickets found.
                    </Typography>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                                {['Dept', 'Member', 'Action', 'Details', 'Issued By', 'Date', 'Status', ''].map((h, i) => (
                                    <th key={i} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(t => (
                                <tr
                                    key={t._id}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'default' }}
                                >
                                    <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap' }}>
                                        <Chip
                                            label={DEPT_LABELS[t.department] ?? t.department}
                                            size='small'
                                            sx={{
                                                fontSize: '0.6rem',
                                                fontWeight: 700,
                                                letterSpacing: 1,
                                                height: 18,
                                                borderRadius: '2px',
                                                textTransform: 'uppercase',
                                                '& .MuiChip-label': { textTransform: 'uppercase' },
                                                background: t.department === 'allstaff'
                                                    ? 'rgba(0,195,255,0.1)'
                                                    : 'rgba(219,0,29,0.08)',
                                                color: t.department === 'allstaff'
                                                    ? '#00c3ff'
                                                    : 'rgba(237,237,237,0.5)',
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)', whiteSpace: 'nowrap' }}>{t.targetUserName}</td>
                                    <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.75)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                        {ticketActionLabel(t)}
                                    </td>
                                    <TicketSummaryCell t={t} />
                                    <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap' }}>{t.issuedByName}</td>
                                    <td style={{ padding: '9px 14px', color: 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap' }}>{formatDate(t.issuedAt)}</td>
                                    <td style={{ padding: '9px 14px' }}>
                                        <Chip
                                            label={t.status}
                                            color={STATUS_COLORS[t.status] ?? 'default'}
                                            size='small'
                                            sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px', '& .MuiChip-label': { textTransform: 'uppercase' } }}
                                        />
                                    </td>
                                    <td style={{ padding: '9px 14px' }}>
                                        {canAction(t) && (
                                            <Button
                                                size='small'
                                                variant='outlined'
                                                onClick={() => setSelected(t)}
                                                sx={{
                                                    borderRadius: 0,
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.1em',
                                                    padding: '2px 10px',
                                                    minWidth: 0,
                                                    borderColor: 'rgba(219,0,29,0.35)',
                                                    color: 'var(--red)',
                                                    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                                }}
                                            >
                                                Action
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <ActionModal
                    ticket={selected}
                    userId={userId}
                    onClose={() => setSelected(null)}
                    onResolved={handleResolved}
                />
            )}
        </div>
    )
}
