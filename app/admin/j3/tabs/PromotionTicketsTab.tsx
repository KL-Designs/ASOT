'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel,
    Button, Chip, CircularProgress, Typography, Alert, ListSubheader,
} from '@mui/material'
import { Send } from '@mui/icons-material'
import { RANK_GROUPS } from '@/lib/ranks'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'

type TicketRow = Ticket & { _id: string }

interface Member {
    id: string
    displayName: string
    inGameName: string | null
    qualifications: string[]
    currentRank: string | null
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
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiSelect-select': { fontSize: '0.82rem' },
}

export default function PromotionTicketsTab({ displayName, userId }: { displayName: string; userId: string }) {
    const [members, setMembers] = useState<Member[]>([])
    const [myTickets, setMyTickets] = useState<TicketRow[]>([])
    const [loadingMembers, setLoadingMembers] = useState(true)
    const [loadingTickets, setLoadingTickets] = useState(true)
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 10

    const [selectedMember, setSelectedMember] = useState<Member | null>(null)
    const [action, setAction] = useState<'promote' | 'demote'>('promote')
    const [proposedRank, setProposedRank] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    const fetchMyTickets = useCallback(async () => {
        setLoadingTickets(true)
        try {
            const res = await fetch(`/api/admin/tickets?issuedById=${userId}`)
            const data = await res.json()
            setMyTickets((data.tickets ?? []).filter((t: TicketRow) => t.type === 'j3-promotion'))
            setPage(0)
        } finally {
            setLoadingTickets(false)
        }
    }, [userId])

    useEffect(() => {
        fetch('/api/admin/members')
            .then(r => r.json())
            .then(d => setMembers(d.members ?? []))
            .finally(() => setLoadingMembers(false))
        fetchMyTickets()
    }, [fetchMyTickets])

    async function handleSubmit() {
        if (!selectedMember || !proposedRank) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)
        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'j3-promotion',
                    action,
                    proposedRank,
                    targetUserId: selectedMember.id,
                    targetUserName: selectedMember.displayName,
                    notes: notes.trim() || undefined,
                }),
            })
            if (!res.ok) {
                const data = await res.json()
                setSubmitError(data.error || 'Failed to submit ticket')
                return
            }
            setSelectedMember(null)
            setProposedRank('')
            setNotes('')
            setSubmitSuccess('Promotion ticket submitted successfully.')
            fetchMyTickets()
        } catch {
            setSubmitError('Failed to submit ticket')
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 5000)
        }
    }

    const canSubmit = !submitting && !!selectedMember && !!proposedRank

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

    return (
        <div className='p-6 flex flex-col gap-5'>
            {/* Submit Ticket */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Submit Promotion Ticket</Typography>
                <div className='flex flex-col gap-4'>
                    <div className='flex gap-3 flex-wrap'>
                        <Autocomplete
                            options={members}
                            getOptionLabel={m => m.inGameName ? `${m.displayName} (${m.inGameName})` : m.displayName}
                            renderOption={(props, m) => (
                                <li {...props} key={m.id}>
                                    <div>
                                        <div style={{ fontSize: '0.82rem' }}>
                                            {m.inGameName ? `${m.displayName} (${m.inGameName})` : m.displayName}
                                        </div>
                                        {m.currentRank && (
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                                                {m.currentRank}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            )}
                            value={selectedMember}
                            onChange={(_, v) => setSelectedMember(v)}
                            loading={loadingMembers}
                            sx={{ minWidth: 260, flex: 1, ...inputSx }}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label='Member'
                                    size='small'
                                    sx={inputSx}
                                    helperText={selectedMember?.currentRank ? `Current rank: ${selectedMember.currentRank}` : undefined}
                                    FormHelperTextProps={{ style: { fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', margin: '4px 0 0' } }}
                                />
                            )}
                            size='small'
                        />
                        <FormControl size='small' sx={{ minWidth: 140, ...inputSx }}>
                            <InputLabel>Action</InputLabel>
                            <Select
                                value={action}
                                label='Action'
                                onChange={e => setAction(e.target.value as 'promote' | 'demote')}
                            >
                                <MenuItem value='promote' sx={{ fontSize: '0.82rem' }}>Promote</MenuItem>
                                <MenuItem value='demote' sx={{ fontSize: '0.82rem' }}>Demote</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl size='small' sx={{ minWidth: 260, flex: 1, ...inputSx }}>
                            <InputLabel>Proposed Rank</InputLabel>
                            <Select
                                value={proposedRank}
                                label='Proposed Rank'
                                onChange={e => setProposedRank(e.target.value)}
                                MenuProps={{ PaperProps: { style: { maxHeight: 360 } } }}
                            >
                                {RANK_GROUPS.map(group => [
                                    <ListSubheader key={group.group} sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', lineHeight: '28px', background: '#1a1a1a' }}>
                                        {group.group}
                                    </ListSubheader>,
                                    ...group.ranks.map(r => (
                                        <MenuItem key={r.name} value={r.name} sx={{ fontSize: '0.82rem', paddingLeft: 3 }}>
                                            {r.name}
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', marginLeft: 8 }}>{r.abbr}</span>
                                        </MenuItem>
                                    )),
                                ])}
                            </Select>
                        </FormControl>
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
                            {submitting ? 'Submitting…' : 'Submit Ticket'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* My Submitted Tickets */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>My Submitted Tickets</Typography>
                {loadingTickets ? (
                    <TacticalSkeleton rows={4} className='px-4' />
                ) : myTickets.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No tickets submitted yet.
                    </Typography>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                        {['Member', 'Action', 'Proposed Rank', 'Status', 'Date'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {myTickets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(t => (
                                        <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }}>{t.targetUserName}</td>
                                            <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)', textTransform: 'capitalize' }}>{t.action}</td>
                                            <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }}>{t.proposedRank}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <Chip
                                                    label={t.status}
                                                    color={STATUS_COLORS[t.status] ?? 'default'}
                                                    size='small'
                                                    sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.45)' }}>{formatDate(t.issuedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {myTickets.length > PAGE_SIZE && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, myTickets.length)} of {myTickets.length}
                                </span>
                                <button
                                    onClick={() => setPage(p => p - 1)}
                                    disabled={page === 0}
                                    style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', background: 'none', border: '1px solid rgba(219,0,29,0.25)', color: page === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.5)', cursor: page === 0 ? 'default' : 'pointer' }}
                                >Prev</button>
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={(page + 1) * PAGE_SIZE >= myTickets.length}
                                    style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', background: 'none', border: '1px solid rgba(219,0,29,0.25)', color: (page + 1) * PAGE_SIZE >= myTickets.length ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.5)', cursor: (page + 1) * PAGE_SIZE >= myTickets.length ? 'default' : 'pointer' }}
                                >Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
