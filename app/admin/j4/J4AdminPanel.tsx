'use client'

import { useState } from 'react'
import { Typography, Dialog, DialogContent, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, Tabs, Tab } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'
import ImportPanel from '../ImportPanel'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'
import PinTabLabel from '@/app/admin/_components/PinTabLabel'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'
import { useTabState } from '@/app/admin/_components/useTabState'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        background: 'rgba(255,255,255,0.04)',
        color: '#ededed',
        borderRadius: 0,
    },
    '& .MuiInputLabel-root': { color: 'rgba(237,237,237,0.4)' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
}

interface MemberOption {
    id: string
    displayName: string
}

function DischargeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [members, setMembers] = useState<MemberOption[]>([])
    const [membersLoaded, setMembersLoaded] = useState(false)
    const [loadingMembers, setLoadingMembers] = useState(false)

    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [dischargeType, setDischargeType] = useState<'honorable' | 'dishonorable' | ''>('')
    const [dischargeReason, setDischargeReason] = useState('')
    const [notes, setNotes] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    function handleOpen() {
        if (membersLoaded) return
        setLoadingMembers(true)
        fetch('/api/admin/members')
            .then(r => r.json())
            .then(data => {
                setMembers(data.members ?? [])
                setMembersLoaded(true)
            })
            .catch(() => setError('Failed to load members'))
            .finally(() => setLoadingMembers(false))
    }

    function handleClose() {
        setSelectedMember(null)
        setDischargeType('')
        setDischargeReason('')
        setNotes('')
        setError(null)
        setSuccessMsg(null)
        onClose()
    }

    async function handleSubmit() {
        if (!selectedMember || !dischargeType || !dischargeReason.trim()) {
            setError('Please fill in all required fields.')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'j4-discharge',
                    targetUserId: selectedMember.id,
                    targetUserName: selectedMember.displayName,
                    dischargeType,
                    dischargeReason: dischargeReason.trim(),
                    notes: notes.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Submission failed.')
            } else {
                setSuccessMsg('Discharge request submitted. Awaiting approval from another J4 member.')
                setSelectedMember(null)
                setDischargeType('')
                setDischargeReason('')
                setNotes('')
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            TransitionProps={{ onEntered: handleOpen }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.2)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 480,
                    maxWidth: 560,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    Discharge Member
                </Typography>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Autocomplete
                        options={members}
                        getOptionLabel={o => o.displayName}
                        value={selectedMember}
                        onChange={(_, v) => setSelectedMember(v)}
                        loading={loadingMembers}
                        noOptionsText={membersLoaded ? 'No members found' : 'Loading…'}
                        renderInput={params => (
                            <TextField
                                {...params}
                                label='Member *'
                                sx={inputSx}
                                InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                        <>
                                            {loadingMembers && <CircularProgress size={16} style={{ color: 'var(--red)' }} />}
                                            {params.InputProps.endAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                        ListboxProps={{ style: { background: '#1a1a1a', color: '#ededed' } }}
                    />

                    <FormControl fullWidth sx={inputSx}>
                        <InputLabel>Discharge Type *</InputLabel>
                        <Select
                            value={dischargeType}
                            label='Discharge Type *'
                            onChange={e => setDischargeType(e.target.value as 'honorable' | 'dishonorable')}
                            MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}
                        >
                            <MenuItem value='honorable'>Honorable</MenuItem>
                            <MenuItem value='dishonorable'>Dishonorable</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        label='Reason *'
                        value={dischargeReason}
                        onChange={e => setDischargeReason(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                        sx={inputSx}
                    />

                    <TextField
                        label='Notes (optional)'
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        sx={inputSx}
                    />
                </div>

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}
                {successMsg && (
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(100,220,100,0.9)', marginTop: 12 }}>{successMsg}</Typography>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            background: submitting ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.3)',
                            border: '1px solid rgba(219,0,29,0.4)',
                            color: submitting ? 'rgba(237,237,237,0.4)' : '#ededed',
                            padding: '7px 18px',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        {submitting ? 'SUBMITTING…' : 'SUBMIT'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

interface DischargedMember {
    id: string
    displayName: string
    discharged: {
        date: string
        type: 'honorable' | 'dishonorable'
        reason: string
        dischargedByName: string
        approvedByName: string
    }
}

function ReinstateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [members, setMembers] = useState<DischargedMember[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [reinstating, setReinstating] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    function load() {
        if (loaded) return
        setLoading(true)
        fetch('/api/admin/members/discharged')
            .then(r => r.json())
            .then(data => {
                setMembers(data.members ?? [])
                setLoaded(true)
            })
            .catch(() => setError('Failed to load discharged members'))
            .finally(() => setLoading(false))
    }

    function handleClose() {
        setError(null)
        onClose()
    }

    async function reinstate(member: DischargedMember) {
        setReinstating(member.id)
        setError(null)
        try {
            const res = await fetch('/api/admin/members/discharged', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: member.id }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Reinstatement failed.')
            } else {
                setMembers(prev => prev.filter(m => m.id !== member.id))
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setReinstating(null)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            TransitionProps={{ onEntered: load }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.2)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 520,
                    maxWidth: 640,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    Reinstate Member
                </Typography>

                {loading && <TacticalSkeleton rows={5} className='px-4' />}

                {loaded && members.length === 0 && (
                    <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.35)', padding: '12px 0' }}>
                        No discharged members.
                    </Typography>
                )}

                {members.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {members.map(m => (
                            <div
                                key={m.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{m.displayName}</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.6rem',
                                            fontWeight: 700,
                                            letterSpacing: 1,
                                            padding: '1px 6px',
                                            background: m.discharged.type === 'honorable' ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.12)',
                                            color: m.discharged.type === 'honorable' ? 'rgb(0,195,100)' : 'var(--red)',
                                        }}>
                                            {m.discharged.type === 'honorable' ? 'HONORABLE' : 'DISHONORABLE'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>{m.discharged.date}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                            {m.discharged.reason}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => reinstate(m)}
                                    disabled={reinstating === m.id}
                                    style={{
                                        background: 'rgba(0,195,100,0.1)',
                                        border: '1px solid rgba(0,195,100,0.3)',
                                        color: reinstating === m.id ? 'rgba(237,237,237,0.3)' : 'rgb(0,195,100)',
                                        padding: '5px 14px',
                                        cursor: reinstating === m.id ? 'not-allowed' : 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        letterSpacing: 1,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0,
                                    }}
                                >
                                    {reinstating === m.id ? 'REINSTATING…' : 'REINSTATE'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CLOSE
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default function J4AdminPanel({ userId }: { userId: string }) {
    const { tab, setTab, view, setView } = useTabState(0, 'dept')
    const [importOpen, setImportOpen] = useState(false)
    const [dischargeOpen, setDischargeOpen] = useState(false)
    const [reinstateOpen, setReinstateOpen] = useState(false)

    const tabSx = {
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        minHeight: 40,
        padding: '8px 16px',
        color: 'rgba(237,237,237,0.5)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>

            {/* Header */}
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.3)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'rgba(219,0,29,0.35)' }}>//</span> DEPARTMENTS
                </span>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J4] Administration
                    </Typography>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                            style={{
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                padding: '4px 10px',
                                background: view === 'calendar' ? 'rgba(219,0,29,0.3)' : 'none',
                                border: '1px solid rgba(219,0,29,0.25)',
                                color: view === 'calendar' ? 'var(--foreground)' : 'rgba(237,237,237,0.4)',
                                cursor: 'pointer',
                            }}
                            onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}
                        >Calendar</button>
                    </div>
                </div>
            </div>

            {view === 'calendar' && <DeptCalendarTab department='j4' userId={userId} isJ4={true} />}
            {view !== 'calendar' && (
                <>
                    {/* Tabs */}
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.3)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Tools' pinLabel='J4 — Tools' href='/admin/j4' tabIndex={0} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && (
                            <div className='p-6 md:p-10 flex flex-col gap-6'>
                        {/* Tools */}
                        <div>
                            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                                Tools
                            </Typography>
                            <div className='flex flex-wrap gap-4'>

                                <button
                                    onClick={() => setImportOpen(true)}
                                    className='flex-1 min-w-[160px] max-w-[220px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.3)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Import<br />Panel
                                        </Typography>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setDischargeOpen(true)}
                                    className='flex-1 min-w-[160px] max-w-[220px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.3)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Discharge<br />Member
                                        </Typography>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setReinstateOpen(true)}
                                    className='flex-1 min-w-[160px] max-w-[220px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(0,195,100,0.06)]'
                                        style={{ border: '1px solid rgba(0,195,100,0.15)', borderTop: '2px solid rgb(0,195,100)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase', color: 'rgba(0,195,100,0.8)' }}>
                                            Reinstate<br />Member
                                        </Typography>
                                    </div>
                                </button>

                            </div>
                        </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
            <DischargeModal open={dischargeOpen} onClose={() => setDischargeOpen(false)} />
            <ReinstateModal open={reinstateOpen} onClose={() => setReinstateOpen(false)} />
        </div>
    )
}
