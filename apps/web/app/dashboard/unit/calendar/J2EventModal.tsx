'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, CircularProgress, Alert, Typography,
} from '@mui/material'
import { Block, AssignmentLate } from '@mui/icons-material'

interface OperationOption {
    id: string
    title: string
}

interface J2EventModalProps {
    open: boolean
    onClose: () => void
    onSaved: () => void
    mode: 'unavailability' | 'mission_check'
}

function toLocalDatetimeValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function J2EventModal({ open, onClose, onSaved, mode }: J2EventModalProps) {
    const now = new Date()
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

    const [startVal, setStartVal] = useState(toLocalDatetimeValue(now))
    const [endVal, setEndVal] = useState(toLocalDatetimeValue(oneHourLater))
    const [description, setDescription] = useState('')
    const [selectedOpId, setSelectedOpId] = useState('')
    const [selectedOpTitle, setSelectedOpTitle] = useState('')
    const [operations, setOperations] = useState<OperationOption[]>([])
    const [opsLoading, setOpsLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // Reset state when modal opens
    useEffect(() => {
        if (!open) return
        const n = new Date()
        setStartVal(toLocalDatetimeValue(n))
        setEndVal(toLocalDatetimeValue(new Date(n.getTime() + 60 * 60 * 1000)))
        setDescription('')
        setSelectedOpId('')
        setSelectedOpTitle('')
        setError('')
    }, [open])

    // Load operations for mission check mode
    useEffect(() => {
        if (!open || mode !== 'mission_check') return
        setOpsLoading(true)
        fetch('/api/operations?status=In Development,Upcoming&limit=100')
            .then(r => r.json())
            .then(d => {
                const ops: OperationOption[] = (d.operations ?? []).map((o: { _id: string; title: string }) => ({
                    id: o._id,
                    title: o.title,
                }))
                setOperations(ops)
            })
            .catch(() => setOperations([]))
            .finally(() => setOpsLoading(false))
    }, [open, mode])

    async function handleSave() {
        setError('')

        const start = new Date(startVal)
        const end = new Date(endVal)

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            setError('Invalid date/time values.')
            return
        }
        if (start >= end) {
            setError('End time must be after start time.')
            return
        }
        if (mode === 'mission_check' && !selectedOpId) {
            setError('Please select an operation.')
            return
        }

        setSaving(true)
        try {
            const body: Record<string, unknown> = {
                department: 'j2',
                start: start.toISOString(),
                end: end.toISOString(),
                allDay: false,
            }

            if (mode === 'unavailability') {
                body.title = 'J2 Lead Unavailability'
                body.isJ2Unavailability = true
                if (description.trim()) body.description = description.trim()
            } else {
                body.title = `Mission Check Request — ${selectedOpTitle}`
                body.isMissionCheckRequest = true
                body.relatedOperationId = selectedOpId
                body.relatedOperationTitle = selectedOpTitle
                if (description.trim()) body.description = description.trim()
            }

            const res = await fetch('/api/admin/calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(d.error ?? 'Failed to save event.')
                return
            }

            onSaved()
            onClose()
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const isUnavailability = mode === 'unavailability'

    const accentColor = isUnavailability ? 'var(--red)' : 'var(--info)'
    const titleText = isUnavailability ? 'Block Unavailability' : 'Request Mission Check'
    const TitleIcon = isUnavailability ? Block : AssignmentLate

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--surface, #1a1a1a)',
                    border: `1px solid ${accentColor}44`,
                    borderTop: `2px solid ${accentColor}`,
                    borderRadius: 0,
                },
            }}
        >
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TitleIcon sx={{ color: accentColor, fontSize: '1.1rem' }} />
                <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={1.5} textTransform='uppercase'>
                    {titleText}
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.75rem' }}>{error}</Alert>}

                {/* Operation selector — mission check only */}
                {!isUnavailability && (
                    <TextField
                        select
                        label='Operation'
                        value={selectedOpId}
                        onChange={e => {
                            const op = operations.find(o => o.id === e.target.value)
                            setSelectedOpId(e.target.value)
                            setSelectedOpTitle(op?.title ?? '')
                        }}
                        size='small'
                        fullWidth
                        disabled={opsLoading}
                        InputProps={{ style: { borderRadius: 0, fontSize: '0.82rem' } }}
                        InputLabelProps={{ style: { fontSize: '0.8rem' } }}
                        helperText={opsLoading ? 'Loading operations…' : undefined}
                    >
                        {operations.map(op => (
                            <MenuItem key={op.id} value={op.id} sx={{ fontSize: '0.82rem' }}>
                                {op.title}
                            </MenuItem>
                        ))}
                        {!opsLoading && operations.length === 0 && (
                            <MenuItem disabled sx={{ fontSize: '0.82rem' }}>No active operations found</MenuItem>
                        )}
                    </TextField>
                )}

                {/* Date/time range */}
                <div style={{ display: 'flex', gap: 12 }}>
                    <TextField
                        label='Start'
                        type='datetime-local'
                        value={startVal}
                        onChange={e => setStartVal(e.target.value)}
                        size='small'
                        fullWidth
                        InputLabelProps={{ shrink: true, style: { fontSize: '0.8rem' } }}
                        InputProps={{ style: { borderRadius: 0, fontSize: '0.82rem' } }}
                    />
                    <TextField
                        label='End'
                        type='datetime-local'
                        value={endVal}
                        onChange={e => setEndVal(e.target.value)}
                        size='small'
                        fullWidth
                        InputLabelProps={{ shrink: true, style: { fontSize: '0.8rem' } }}
                        InputProps={{ style: { borderRadius: 0, fontSize: '0.82rem' } }}
                    />
                </div>

                {/* Optional note */}
                <TextField
                    label={isUnavailability ? 'Reason (optional)' : 'Notes (optional)'}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    size='small'
                    fullWidth
                    multiline
                    rows={2}
                    InputProps={{ style: { borderRadius: 0, fontSize: '0.82rem' } }}
                    InputLabelProps={{ style: { fontSize: '0.8rem' } }}
                />

                {!isUnavailability && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>
                        Submitting this request will notify all J2 Leads and create a task for assignment.
                        You will receive a confirmation notification once submitted.
                    </Typography>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button
                    onClick={onClose}
                    disabled={saving}
                    sx={{ borderRadius: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.5)' }}
                >
                    Cancel
                </Button>
                <Button
                    variant='outlined'
                    onClick={handleSave}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={12} /> : undefined}
                    sx={{
                        borderRadius: 0,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        borderColor: `${accentColor}66`,
                        color: accentColor,
                        '&:hover': { borderColor: accentColor, background: `${accentColor}10` },
                    }}
                >
                    {saving ? 'Saving…' : isUnavailability ? 'Block Dates' : 'Submit Request'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
