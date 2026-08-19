'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel,
    Button, Chip, CircularProgress, Typography, Alert, Switch, FormControlLabel,
} from '@mui/material'
import { Send, Group, Person } from '@mui/icons-material'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type TicketRow = Ticket & { _id: string }

interface Member {
    id: string
    displayName: string
    inGameName: string | null
    qualifications: string[]
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

export default function QualificationTicketsTab({ displayName, userId }: { displayName: string; userId: string }) {
    const [members, setMembers] = useState<Member[]>([])
    const [myTickets, setMyTickets] = useState<TicketRow[]>([])
    const [loadingMembers, setLoadingMembers] = useState(true)
    const [loadingTickets, setLoadingTickets] = useState(true)
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 10

    // Mode
    const [bulkMode, setBulkMode] = useState(false)

    // Form state — single
    const [selectedMember, setSelectedMember] = useState<Member | null>(null)

    // Form state — bulk
    const [selectedMembers, setSelectedMembers] = useState<Member[]>([])

    // Shared form state
    const [action, setAction] = useState<'add' | 'remove'>('add')
    const [qualification, setQualification] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    const fetchMyTickets = useCallback(async () => {
        setLoadingTickets(true)
        try {
            const res = await fetch(`/api/admin/tickets?issuedById=${userId}`)
            const data = await res.json()
            setMyTickets((data.tickets ?? []).filter((t: TicketRow) => t.type === 'j3-qualification'))
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

    // When member/action changes, reset qualification (the available options may change)
    useEffect(() => { setQualification('') }, [selectedMember, selectedMembers, action])

    // Filter qual list for single mode based on what the member has/doesn't have
    const availableQuals = useMemo(() => {
        if (bulkMode) {
            // In bulk: show quals applicable to at least one selected member
            if (selectedMembers.length === 0) return CERTIFICATIONS
            return CERTIFICATIONS.filter(c => {
                if (action === 'add') return selectedMembers.some(m => !m.qualifications.includes(c.label))
                return selectedMembers.some(m => m.qualifications.includes(c.label))
            })
        } else {
            if (!selectedMember) return CERTIFICATIONS
            if (action === 'add') return CERTIFICATIONS.filter(c => !selectedMember.qualifications.includes(c.label))
            return CERTIFICATIONS.filter(c => selectedMember.qualifications.includes(c.label))
        }
    }, [bulkMode, selectedMember, selectedMembers, action])

    async function submitTicket(member: Member) {
        const res = await fetch('/api/admin/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'j3-qualification',
                action,
                qualification,
                targetUserId: member.id,
                targetUserName: member.displayName,
                notes: notes.trim() || undefined,
            }),
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to submit ticket')
        }
    }

    async function handleSubmit() {
        if (!qualification) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)

        try {
            if (!bulkMode) {
                if (!selectedMember) return
                await submitTicket(selectedMember)
                setSelectedMember(null)
                setQualification('')
                setNotes('')
                setSubmitSuccess('Ticket submitted successfully.')
                fetchMyTickets()
            } else {
                if (selectedMembers.length === 0) return

                // Split members into applicable and skipped
                const applicable = selectedMembers.filter(m =>
                    action === 'add'
                        ? !m.qualifications.includes(qualification)
                        : m.qualifications.includes(qualification)
                )
                const skipped = selectedMembers.length - applicable.length

                if (applicable.length === 0) {
                    setSubmitError(
                        action === 'add'
                            ? 'All selected members already have this qualification.'
                            : 'None of the selected members have this qualification.'
                    )
                    return
                }

                const results = await Promise.allSettled(applicable.map(m => submitTicket(m)))
                const failed = results.filter(r => r.status === 'rejected').length
                const succeeded = results.filter(r => r.status === 'fulfilled').length

                if (failed > 0 && succeeded === 0) {
                    setSubmitError(`All ${failed} ticket submissions failed.`)
                } else {
                    setSelectedMembers([])
                    setQualification('')
                    setNotes('')
                    const parts: string[] = [`${succeeded} ticket${succeeded !== 1 ? 's' : ''} submitted.`]
                    if (skipped > 0) parts.push(`${skipped} skipped (qualification already ${action === 'add' ? 'held' : 'absent'}).`)
                    if (failed > 0) parts.push(`${failed} failed.`)
                    setSubmitSuccess(parts.join(' '))
                    fetchMyTickets()
                }
            }
        } catch (e: unknown) {
            setSubmitError(e instanceof Error ? e.message : 'Failed to submit ticket')
        } finally {
            setSubmitting(false)
            setTimeout(() => { setSubmitSuccess(null); setSubmitError(null) }, 5000)
        }
    }

    const canSubmit = !submitting && !!qualification && (bulkMode ? selectedMembers.length > 0 : !!selectedMember)

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
                <div className='flex items-center justify-between mb-3'>
                    <Typography style={labelStyle}>Submit Qualification Ticket</Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                size='small'
                                checked={bulkMode}
                                onChange={e => {
                                    setBulkMode(e.target.checked)
                                    setSelectedMember(null)
                                    setSelectedMembers([])
                                    setQualification('')
                                }}
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                }}
                            />
                        }
                        label={
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {bulkMode ? <Group sx={{ fontSize: 14 }} /> : <Person sx={{ fontSize: 14 }} />}
                                {bulkMode ? 'Bulk' : 'Single'}
                            </span>
                        }
                        labelPlacement='start'
                        sx={{ margin: 0, gap: 1 }}
                    />
                </div>
                <div className='flex flex-col gap-4'>
                    <div className='flex gap-3 flex-wrap'>
                        {bulkMode ? (
                            <Autocomplete
                                multiple
                                options={members}
                                getOptionLabel={m => m.inGameName ? `${m.displayName} (${m.inGameName})` : m.displayName}
                                value={selectedMembers}
                                onChange={(_, v) => setSelectedMembers(v)}
                                loading={loadingMembers}
                                sx={{ minWidth: 300, flex: 2, ...inputSx }}
                                renderInput={params => (
                                    <TextField {...params} label='Members' size='small' sx={inputSx} />
                                )}
                                renderTags={(value, getTagProps) =>
                                    value.map((m, i) => (
                                        <Chip
                                            {...getTagProps({ index: i })}
                                            key={m.id}
                                            label={m.displayName}
                                            size='small'
                                            sx={{ fontSize: '0.7rem', height: 20, borderRadius: '2px' }}
                                        />
                                    ))
                                }
                                size='small'
                            />
                        ) : (
                            <Autocomplete
                                options={members}
                                getOptionLabel={m => m.inGameName ? `${m.displayName} (${m.inGameName})` : m.displayName}
                                value={selectedMember}
                                onChange={(_, v) => setSelectedMember(v)}
                                loading={loadingMembers}
                                sx={{ minWidth: 260, flex: 1, ...inputSx }}
                                renderInput={params => (
                                    <TextField {...params} label='Member' size='small' sx={inputSx} />
                                )}
                                size='small'
                            />
                        )}
                        <FormControl size='small' sx={{ minWidth: 160, ...inputSx }}>
                            <InputLabel>Action</InputLabel>
                            <Select
                                value={action}
                                label='Action'
                                onChange={e => setAction(e.target.value as 'add' | 'remove')}
                            >
                                <MenuItem value='add' sx={{ fontSize: '0.82rem' }}>Add Qualification</MenuItem>
                                <MenuItem value='remove' sx={{ fontSize: '0.82rem' }}>Remove Qualification</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl size='small' sx={{ minWidth: 260, flex: 1, ...inputSx }}>
                            <InputLabel>Qualification</InputLabel>
                            <Select
                                value={qualification}
                                label='Qualification'
                                onChange={e => setQualification(e.target.value)}
                                disabled={availableQuals.length === 0}
                            >
                                {availableQuals.length === 0 ? (
                                    <MenuItem disabled value='' sx={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.35)' }}>
                                        {action === 'add' ? 'Member has all qualifications' : 'Member has no qualifications'}
                                    </MenuItem>
                                ) : availableQuals.map(c => (
                                    <MenuItem key={c.label} value={c.label} sx={{ fontSize: '0.82rem' }}>
                                        {c.label}
                                    </MenuItem>
                                ))}
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
                            {submitting
                                ? 'Submitting…'
                                : bulkMode && selectedMembers.length > 0
                                    ? `Submit ${selectedMembers.length} Ticket${selectedMembers.length !== 1 ? 's' : ''}`
                                    : 'Submit Ticket'}
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
                                    <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                        {['Member', 'Action', 'Qualification', 'Status', 'Date'].map(h => (
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
                                            <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }}>{t.qualification}</td>
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
                                    style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', background: 'none', border: '1px solid var(--line-2)', color: page === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.5)', cursor: page === 0 ? 'default' : 'pointer' }}
                                >Prev</button>
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={(page + 1) * PAGE_SIZE >= myTickets.length}
                                    style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', background: 'none', border: '1px solid var(--line-2)', color: (page + 1) * PAGE_SIZE >= myTickets.length ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.5)', cursor: (page + 1) * PAGE_SIZE >= myTickets.length ? 'default' : 'pointer' }}
                                >Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
