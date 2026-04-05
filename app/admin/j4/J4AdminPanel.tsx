'use client'

import { useState } from 'react'
import { Typography, Dialog, DialogContent, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress } from '@mui/material'
import ImportPanel from '../ImportPanel'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        background: 'rgba(255,255,255,0.02)',
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
                            background: submitting ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.15)',
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

export default function J4AdminPanel() {
    const [importOpen, setImportOpen] = useState(false)
    const [dischargeOpen, setDischargeOpen] = useState(false)

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px]'>

            {/* Header */}
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Department
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    J4 — Administration
                </Typography>
            </div>

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
                            className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                            style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
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
                            className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                            style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                        >
                            <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                Discharge<br />Member
                            </Typography>
                        </div>
                    </button>

                </div>
            </div>

            <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
            <DischargeModal open={dischargeOpen} onClose={() => setDischargeOpen(false)} />
        </div>
    )
}
