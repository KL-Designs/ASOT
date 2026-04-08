'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel,
    Button, Chip, CircularProgress, Typography, Alert, ListSubheader,
} from '@mui/material'
import { Send, CheckCircle, Cancel } from '@mui/icons-material'
import { PLATOON_CATEGORIES, RESERVIST_CATEGORY_IDS } from '@/lib/orbat-constants'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'

type TicketRow = Ticket & { _id: string }

interface OrbatPositionFlat {
    _id: string
    category: string
    sectionTitle: string
    role: string
    positionOrder: number
    sectionOrder: number
    userId: string | null
    userDisplayName: string | null
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

function categoryLabel(category: string) {
    return PLATOON_CATEGORIES.find(c => c._id === category)?.label ?? category
}

function positionLabel(p: OrbatPositionFlat) {
    if (RESERVIST_CATEGORY_IDS.includes(p.category)) return 'Reservist'
    if (!p.sectionTitle) return `${categoryLabel(p.category)} / ${p.role}`
    return `${p.sectionTitle} / ${p.role}`
}

function fromLabel(t: TicketRow) {
    if (t.fromIsReservist) return 'Reservist'
    return t.fromSectionTitle ? `${t.fromSectionTitle} / ${t.fromPositionRole}` : t.fromPositionRole ?? '—'
}

function toLabel(t: TicketRow) {
    if (t.toIsReservist) return 'Reservist'
    return t.toSectionTitle ? `${t.toSectionTitle} / ${t.toPositionRole}` : t.toPositionRole ?? '—'
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
    '& .MuiSelect-select': { fontSize: '0.82rem' },
}

export default function MoveRequestsTab({ userId, displayName }: { userId: string; displayName: string }) {
    const [positions, setPositions] = useState<OrbatPositionFlat[]>([])
    const [myTickets, setMyTickets] = useState<TicketRow[]>([])
    const [pendingApproval, setPendingApproval] = useState<TicketRow[]>([])
    const [loadingPositions, setLoadingPositions] = useState(true)
    const [loadingTickets, setLoadingTickets] = useState(true)

    // Form state
    const [selectedMemberPos, setSelectedMemberPos] = useState<OrbatPositionFlat | null>(null)
    const [destType, setDestType] = useState<'reservist' | string>('')  // '' = unset, 'reservist', or 'sectionKey'
    const [destPositionId, setDestPositionId] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    // Action state for pending approval
    const [actioningId, setActioningId] = useState<string | null>(null)

    const fetchTickets = useCallback(async () => {
        setLoadingTickets(true)
        try {
            const [myRes, pendingRes] = await Promise.all([
                fetch(`/api/admin/tickets?issuedById=${userId}`),
                fetch(`/api/admin/tickets?requiredApproverUserId=${userId}&status=open`),
            ])
            const [myData, pendingData] = await Promise.all([myRes.json(), pendingRes.json()])
            setMyTickets((myData.tickets ?? []).filter((t: TicketRow) => t.type === 'move-request'))
            setPendingApproval((pendingData.tickets ?? []).filter((t: TicketRow) => t.type === 'move-request'))
        } finally {
            setLoadingTickets(false)
        }
    }, [userId])

    useEffect(() => {
        fetch('/api/admin/orbat/for-move')
            .then(r => r.json())
            .then(d => setPositions(d.positions ?? []))
            .finally(() => setLoadingPositions(false))
        fetchTickets()
    }, [fetchTickets])

    // Reset destination when member changes
    useEffect(() => { setDestType(''); setDestPositionId('') }, [selectedMemberPos])
    useEffect(() => { setDestPositionId('') }, [destType])

    // Derived data
    const occupiedPositions = useMemo(
        () => positions.filter(p => p.userId !== null),
        [positions]
    )

    // Sections that have at least one vacant non-reservist position
    const sectionsWithVacancy = useMemo(() => {
        const vacantNonReservist = positions.filter(
            p => p.userId === null && !RESERVIST_CATEGORY_IDS.includes(p.category)
        )
        const sectionKeys = new Set(vacantNonReservist.map(p => `${p.category}:::${p.sectionTitle}`))
        return Array.from(sectionKeys).map(key => {
            const [category, sectionTitle] = key.split(':::')
            const label = sectionTitle || categoryLabel(category)
            const groupLabel = categoryLabel(category)
            return { key, category, sectionTitle, label, groupLabel }
        }).sort((a, b) => {
            const catOrder = PLATOON_CATEGORIES.findIndex(c => c._id === a.category) -
                PLATOON_CATEGORIES.findIndex(c => c._id === b.category)
            if (catOrder !== 0) return catOrder
            return a.sectionTitle.localeCompare(b.sectionTitle)
        })
    }, [positions])

    // Vacant positions within the selected destination section
    const vacantPositionsInDest = useMemo(() => {
        if (!destType || destType === 'reservist') return []
        const [category, sectionTitle] = destType.split(':::')
        return positions.filter(
            p => p.category === category &&
                p.sectionTitle === sectionTitle &&
                p.userId === null
        ).sort((a, b) => a.positionOrder - b.positionOrder)
    }, [positions, destType])

    // Whether current user is a section leader somewhere
    const myPosition = useMemo(() => positions.find(p => p.userId === userId) ?? null, [positions, userId])

    async function handleSubmit() {
        if (!selectedMemberPos || !destType) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)

        try {
            const body: Record<string, unknown> = {
                type: 'move-request',
                targetUserId: selectedMemberPos.userId,
                targetUserName: selectedMemberPos.userDisplayName ?? selectedMemberPos.userId,
                fromPositionId: selectedMemberPos._id,
                notes: notes.trim() || undefined,
            }

            if (destType === 'reservist') {
                body.toIsReservist = true
            } else {
                if (!destPositionId) {
                    setSubmitError('Please select a destination position.')
                    return
                }
                body.toPositionId = destPositionId
                body.toIsReservist = false
            }

            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await res.json()
            if (!res.ok) {
                setSubmitError(data.error || 'Failed to submit move request')
                return
            }

            setSelectedMemberPos(null)
            setDestType('')
            setDestPositionId('')
            setNotes('')

            if (data.autoApproved) {
                setSubmitSuccess('Move applied immediately — ORBAT updated.')
                // Refresh positions
                fetch('/api/admin/orbat/for-move')
                    .then(r => r.json())
                    .then(d => setPositions(d.positions ?? []))
            } else {
                setSubmitSuccess(`Move request submitted. Awaiting approval from ${data.requiredApproverName ?? 'the section leader'}.`)
            }

            fetchTickets()
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 6000)
        }
    }

    async function handleAction(ticketId: string, decision: 'approve' | 'reject') {
        setActioningId(ticketId)
        try {
            const res = await fetch(`/api/admin/tickets/${ticketId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            })
            if (!res.ok) {
                const data = await res.json()
                alert(data.error || 'Action failed')
                return
            }
            fetchTickets()
            if (decision === 'approve') {
                fetch('/api/admin/orbat/for-move')
                    .then(r => r.json())
                    .then(d => setPositions(d.positions ?? []))
            }
        } finally {
            setActioningId(null)
        }
    }

    const canSubmit = !submitting && !!selectedMemberPos && !!destType && (destType === 'reservist' || !!destPositionId)

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
                <Typography style={labelStyle}>Submit Move Request</Typography>
                {myPosition && (
                    <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.35)', marginBottom: 16 }}>
                        Your position: {positionLabel(myPosition)}
                        {myPosition.positionOrder === 0 ? ' (Section Leader)' : ''}
                    </Typography>
                )}
                <div className='flex flex-col gap-4'>
                    <div className='flex gap-3 flex-wrap'>
                        <Autocomplete
                            options={occupiedPositions}
                            getOptionLabel={p => p.userDisplayName ?? p.userId ?? ''}
                            renderOption={(props, p) => (
                                <li {...props} key={p._id}>
                                    <div>
                                        <div style={{ fontSize: '0.82rem' }}>{p.userDisplayName ?? p.userId}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                                            {positionLabel(p)}
                                        </div>
                                    </div>
                                </li>
                            )}
                            value={selectedMemberPos}
                            onChange={(_, v) => setSelectedMemberPos(v)}
                            loading={loadingPositions}
                            sx={{ minWidth: 260, flex: 1, ...inputSx }}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label='Member to Move'
                                    size='small'
                                    sx={inputSx}
                                    helperText={selectedMemberPos ? positionLabel(selectedMemberPos) : undefined}
                                    FormHelperTextProps={{ style: { fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', margin: '4px 0 0' } }}
                                />
                            )}
                            size='small'
                        />
                        <FormControl size='small' sx={{ minWidth: 220, flex: 1, ...inputSx }}>
                            <InputLabel>Destination</InputLabel>
                            <Select
                                value={destType}
                                label='Destination'
                                onChange={e => setDestType(e.target.value)}
                                MenuProps={{ PaperProps: { style: { maxHeight: 360 } } }}
                            >
                                <MenuItem value='reservist' sx={{ fontSize: '0.82rem' }}>
                                    Active Reservist
                                </MenuItem>
                                {sectionsWithVacancy.length > 0 && (
                                    <ListSubheader sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', lineHeight: '28px', background: '#1a1a1a' }}>
                                        Sections
                                    </ListSubheader>
                                )}
                                {sectionsWithVacancy.map(s => (
                                    <MenuItem key={s.key} value={s.key} sx={{ fontSize: '0.82rem', paddingLeft: 3 }}>
                                        {s.label}
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', marginLeft: 8 }}>{s.groupLabel}</span>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {destType && destType !== 'reservist' && (
                            <FormControl size='small' sx={{ minWidth: 200, flex: 1, ...inputSx }}>
                                <InputLabel>Position</InputLabel>
                                <Select
                                    value={destPositionId}
                                    label='Position'
                                    onChange={e => setDestPositionId(e.target.value)}
                                    disabled={vacantPositionsInDest.length === 0}
                                >
                                    {vacantPositionsInDest.map(p => (
                                        <MenuItem key={p._id} value={p._id} sx={{ fontSize: '0.82rem' }}>
                                            {p.role}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </div>
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
                                borderColor: 'rgba(219,0,29,0.27)',
                                color: 'var(--red)',
                                '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                '&:disabled': { opacity: 0.4 },
                            }}
                        >
                            {submitting ? 'Submitting…' : 'Submit Move Request'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Pending My Approval */}
            {(loadingTickets || pendingApproval.length > 0) && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>Pending My Approval</Typography>
                    {loadingTickets ? (
                        <TacticalSkeleton rows={4} className='px-4' />
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                        {['Member', 'From', 'To', 'Requested By', 'Date', 'Action'].map(h => (
                                            <th key={h} style={thStyle}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingApproval.map(t => (
                                        <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={tdStyle}>{t.targetUserName}</td>
                                            <td style={tdStyle}>{fromLabel(t)}</td>
                                            <td style={tdStyle}>{toLabel(t)}</td>
                                            <td style={tdStyle}>{t.issuedByName}</td>
                                            <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatDate(t.issuedAt)}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <div className='flex gap-2'>
                                                    <Button
                                                        size='small'
                                                        variant='outlined'
                                                        disabled={actioningId === t._id}
                                                        startIcon={<CheckCircle sx={{ fontSize: 13 }} />}
                                                        onClick={() => handleAction(t._id, 'approve')}
                                                        sx={{
                                                            borderRadius: 0,
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            letterSpacing: '0.08em',
                                                            borderColor: 'rgba(46,160,67,0.4)',
                                                            color: '#2ea043',
                                                            '&:hover': { borderColor: '#2ea043', background: 'rgba(46,160,67,0.06)' },
                                                            '&:disabled': { opacity: 0.4 },
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size='small'
                                                        variant='outlined'
                                                        disabled={actioningId === t._id}
                                                        startIcon={<Cancel sx={{ fontSize: 13 }} />}
                                                        onClick={() => handleAction(t._id, 'reject')}
                                                        sx={{
                                                            borderRadius: 0,
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            letterSpacing: '0.08em',
                                                            borderColor: 'rgba(219,0,29,0.42)',
                                                            color: 'var(--red)',
                                                            '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                                            '&:disabled': { opacity: 0.4 },
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        Reject
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* My Submitted Requests */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>My Submitted Requests</Typography>
                {loadingTickets ? (
                    <TacticalSkeleton rows={4} className='px-4' />
                ) : myTickets.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No move requests submitted yet.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                    {['Member', 'From', 'To', 'Status', 'Date'].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {myTickets.map(t => (
                                    <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={tdStyle}>{t.targetUserName}</td>
                                        <td style={tdStyle}>{fromLabel(t)}</td>
                                        <td style={tdStyle}>{toLabel(t)}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Chip
                                                label={t.status}
                                                color={STATUS_COLORS[t.status] ?? 'default'}
                                                size='small'
                                                sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }}
                                            />
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
