'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, CircularProgress, Alert, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import { BugReport, CheckCircle } from '@mui/icons-material'

type FeedbackRow = OperationModFeedback & { _id: string }
type OpOption = { id: string; title: string }

const SEVERITY_COLOUR: Record<string, string> = {
    minor:    'rgba(255,167,38,0.8)',
    major:    'rgba(239,83,80,0.8)',
    critical: 'rgba(219,0,29,0.9)',
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0, fontSize: '0.82rem', background: 'rgba(255,255,255,0.03)',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)' },
    '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem' },
    '& .MuiSelect-icon': { color: 'rgba(237,237,237,0.4)' },
}

export default function MissionModFeedbackTab() {
    const [ops, setOps]           = useState<OpOption[]>([])
    const [selectedOp, setSelectedOp] = useState<OpOption | null>(null)
    const [opSearch, setOpSearch] = useState('')
    const [feedback, setFeedback] = useState<FeedbackRow[]>([])
    const [loading, setLoading]   = useState(false)

    const [modName, setModName]       = useState('')
    const [workshopUrl, setWorkshopUrl] = useState('')
    const [issue, setIssue]           = useState('')
    const [severity, setSeverity]     = useState<'minor' | 'major' | 'critical'>('minor')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitOk, setSubmitOk]     = useState(false)

    const [promoting, setPromoting]   = useState<string | null>(null)
    const [promoteError, setPromoteError] = useState<string | null>(null)

    // Load operations for autocomplete
    useEffect(() => {
        if (!opSearch.trim()) { setOps([]); return }
        const t = setTimeout(() => {
            fetch(`/api/operations?search=${encodeURIComponent(opSearch)}&limit=15`)
                .then(r => r.json())
                .then(d => setOps((d.operations ?? []).map((o: { _id: string; title?: string; name?: string }) => ({
                    id: o._id, title: o.title || o.name || o._id,
                }))))
                .catch(() => {})
        }, 250)
        return () => clearTimeout(t)
    }, [opSearch])

    // Load feedback for selected operation
    const loadFeedback = useCallback(() => {
        if (!selectedOp) { setFeedback([]); return }
        setLoading(true)
        fetch(`/api/operations/${selectedOp.id}/mod-feedback`)
            .then(r => r.json())
            .then(d => setFeedback(d.feedback ?? []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [selectedOp])

    useEffect(() => { loadFeedback() }, [loadFeedback])

    async function handleSubmit() {
        if (!selectedOp || !modName.trim() || !issue.trim()) return
        setSubmitting(true); setSubmitError(null); setSubmitOk(false)
        try {
            const res = await fetch(`/api/operations/${selectedOp.id}/mod-feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modName, workshopUrl, issue, severity }),
            })
            const data = await res.json()
            if (!res.ok) { setSubmitError(data.error || 'Submission failed'); return }
            setSubmitOk(true)
            setModName(''); setWorkshopUrl(''); setIssue(''); setSeverity('minor')
            setTimeout(() => setSubmitOk(false), 3000)
            loadFeedback()
        } finally { setSubmitting(false) }
    }

    async function handleAddToDb(feedbackId: string) {
        setPromoting(feedbackId); setPromoteError(null)
        try {
            const res = await fetch(`/api/operations/${selectedOp!.id}/mod-feedback/${feedbackId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add-to-db', status: 'known_issues' }),
            })
            const data = await res.json()
            if (!res.ok) { setPromoteError(data.error || 'Failed'); return }
            loadFeedback()
        } finally { setPromoting(null) }
    }

    async function handleDelete(feedbackId: string) {
        if (!confirm('Remove this feedback entry?')) return
        await fetch(`/api/operations/${selectedOp!.id}/mod-feedback/${feedbackId}`, { method: 'DELETE' })
        loadFeedback()
    }

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Mission Mod Feedback
                </Typography>
                <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)' }}>
                    Report mod issues encountered during a mission. Use &ldquo;Add to Mod Database&rdquo; to promote entries to the unit mod database.
                </Typography>
            </div>

            {/* Operation selector */}
            <Autocomplete
                options={ops}
                value={selectedOp}
                onChange={(_, v) => setSelectedOp(v)}
                inputValue={opSearch}
                onInputChange={(_, v) => setOpSearch(v)}
                getOptionLabel={o => o.title}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={opSearch ? 'No operations found' : 'Type to search operations…'}
                renderInput={params => <TextField {...params} label='Operation' size='small' sx={inputSx} />}
            />

            {/* Submission form */}
            {selectedOp && (
                <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 16 }}>
                        Report a Mod Issue
                    </Typography>

                    {submitError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem', mb: 2 }}>{submitError}</Alert>}
                    {submitOk && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.78rem', mb: 2 }} icon={<CheckCircle sx={{ fontSize: 16 }} />}>Feedback submitted.</Alert>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <TextField label='Mod Name *' size='small' value={modName} onChange={e => setModName(e.target.value)} sx={inputSx} />
                        <TextField label='Workshop URL (optional)' size='small' value={workshopUrl} onChange={e => setWorkshopUrl(e.target.value)} sx={inputSx} />
                        <TextField
                            label='Issue Description *' size='small' value={issue}
                            onChange={e => setIssue(e.target.value)}
                            multiline rows={3} sx={{ ...inputSx, gridColumn: '1 / -1' }}
                        />
                        <FormControl size='small' sx={inputSx}>
                            <InputLabel>Severity</InputLabel>
                            <Select value={severity} label='Severity' onChange={e => setSeverity(e.target.value as typeof severity)}>
                                <MenuItem value='minor' sx={{ fontSize: '0.82rem' }}>Minor</MenuItem>
                                <MenuItem value='major' sx={{ fontSize: '0.82rem' }}>Major</MenuItem>
                                <MenuItem value='critical' sx={{ fontSize: '0.82rem' }}>Critical</MenuItem>
                            </Select>
                        </FormControl>
                    </div>

                    <button
                        disabled={submitting || !modName.trim() || !issue.trim()}
                        onClick={handleSubmit}
                        style={{
                            all: 'unset', cursor: (submitting || !modName.trim() || !issue.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)',
                            color: (submitting || !modName.trim() || !issue.trim()) ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                        }}>
                        {submitting ? <CircularProgress size={12} style={{ color: 'var(--red)' }} /> : <BugReport sx={{ fontSize: 14 }} />}
                        {submitting ? 'Submitting…' : 'Submit Feedback'}
                    </button>
                </div>
            )}

            {/* Feedback list */}
            {selectedOp && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>
                        Feedback for {selectedOp.title}
                    </Typography>

                    {promoteError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{promoteError}</Alert>}

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                            <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                        </div>
                    ) : feedback.length === 0 ? (
                        <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                            No mod feedback submitted for this operation.
                        </Typography>
                    ) : (
                        feedback.map(f => (
                            <div key={f._id} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div className='flex items-start justify-between gap-4'>
                                    <div style={{ flex: 1 }}>
                                        <div className='flex items-center gap-2 mb-1'>
                                            <Typography style={{ fontSize: '0.82rem', fontWeight: 700 }}>{f.modName}</Typography>
                                            <span style={{
                                                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', padding: '1px 6px',
                                                background: 'rgba(255,255,255,0.05)', border: `1px solid ${SEVERITY_COLOUR[f.severity]}22`,
                                                color: SEVERITY_COLOUR[f.severity], borderRadius: 2,
                                            }}>
                                                {f.severity.toUpperCase()}
                                            </span>
                                            {f.addedToDbAt && (
                                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', padding: '1px 6px', background: 'rgba(46,125,50,0.1)', border: '1px solid rgba(46,125,50,0.3)', color: 'rgba(100,220,100,0.8)', borderRadius: 2 }}>
                                                    IN MOD DB
                                                </span>
                                            )}
                                        </div>
                                        {f.workshopUrl && (
                                            <Typography style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>
                                                {f.workshopUrl}
                                            </Typography>
                                        )}
                                        <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.65)', lineHeight: 1.5 }}>
                                            {f.issue}
                                        </Typography>
                                        <Typography style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', marginTop: 6 }}>
                                            Submitted by {f.submittedByName} · {new Date(f.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            {f.addedToDbByName && ` · Added to DB by ${f.addedToDbByName}`}
                                        </Typography>
                                    </div>
                                    <div className='flex gap-2 items-start'>
                                        {!f.addedToDbAt && (
                                            <button
                                                disabled={promoting === f._id}
                                                onClick={() => handleAddToDb(f._id)}
                                                style={{
                                                    all: 'unset', cursor: promoting === f._id ? 'not-allowed' : 'pointer',
                                                    padding: '5px 12px', fontSize: '0.62rem', fontWeight: 700,
                                                    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                                                    background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)',
                                                    color: promoting === f._id ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                                                    whiteSpace: 'nowrap' as const,
                                                }}>
                                                {promoting === f._id ? '…' : 'Add to Mod DB'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(f._id)}
                                            style={{
                                                all: 'unset', cursor: 'pointer', padding: '5px 10px',
                                                fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}>
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
