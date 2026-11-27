'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, CircularProgress, Alert, Autocomplete, TextField } from '@mui/material'
import { CheckCircle, Send } from '@mui/icons-material'

interface InductionRow {
    _id: string
    userId: string
    userName: string
    context: string
    triggerLabel?: string
    triggeredByName: string
    triggeredAt: string
    completedAt?: string
}

interface MemberOption { id: string; label: string }

export default function DeptInductionTab({ dept }: { dept: string }) {
    const [rulesBody, setRulesBody]       = useState('')
    const [tutorialBody, setTutorialBody] = useState('')
    const [contentLoading, setContentLoading] = useState(true)
    const [contentSaving, setContentSaving]   = useState(false)
    const [contentSaved, setContentSaved]     = useState(false)
    const [contentError, setContentError]     = useState<string | null>(null)
    const [updatedByName, setUpdatedByName]   = useState<string | null>(null)
    const [updatedAt, setUpdatedAt]           = useState<string | null>(null)

    const [records, setRecords]       = useState<InductionRow[]>([])
    const [listLoading, setListLoading] = useState(true)

    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [memberSearch, setMemberSearch]   = useState('')
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [context, setContext]   = useState('')
    const [triggerLabel, setTriggerLabel] = useState('')
    const [sending, setSending]   = useState(false)
    const [sendError, setSendError] = useState<string | null>(null)
    const [sendOk, setSendOk]     = useState(false)

    const deptLabel = dept.toUpperCase()

    // Load content
    useEffect(() => {
        fetch(`/api/admin/dept-induction-content?dept=${dept}`)
            .then(r => r.json())
            .then(d => {
                if (d.content) {
                    setRulesBody(d.content.rulesBody ?? '')
                    setTutorialBody(d.content.tutorialBody ?? '')
                    setUpdatedByName(d.content.updatedByName ?? null)
                    setUpdatedAt(d.content.updatedAt ? new Date(d.content.updatedAt).toLocaleString('en-AU') : null)
                }
            })
            .catch(() => setContentError('Failed to load content'))
            .finally(() => setContentLoading(false))
    }, [dept])

    // Load induction records
    const loadRecords = useCallback(() => {
        setListLoading(true)
        fetch(`/api/admin/dept-induction?dept=${dept}`)
            .then(r => r.json())
            .then(d => setRecords(d.records ?? []))
            .catch(() => {})
            .finally(() => setListLoading(false))
    }, [dept])

    useEffect(() => { loadRecords() }, [loadRecords])

    // Member search
    useEffect(() => {
        if (!memberSearch.trim()) { setMemberOptions([]); return }
        const t = setTimeout(() => {
            fetch(`/api/admin/members?search=${encodeURIComponent(memberSearch)}&limit=15`)
                .then(r => r.json())
                .then(d => setMemberOptions((d.members ?? []).map((m: { id: string; name?: string; username?: string }) => ({
                    id: m.id,
                    label: m.name || m.username || m.id,
                }))))
                .catch(() => {})
        }, 250)
        return () => clearTimeout(t)
    }, [memberSearch])

    async function handleSaveContent() {
        setContentSaving(true); setContentError(null); setContentSaved(false)
        try {
            const res = await fetch(`/api/admin/dept-induction-content?dept=${dept}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rulesBody, tutorialBody }),
            })
            const data = await res.json()
            if (!res.ok) { setContentError(data.error || 'Save failed'); return }
            if (data.content?.updatedByName) setUpdatedByName(data.content.updatedByName)
            if (data.content?.updatedAt) setUpdatedAt(new Date(data.content.updatedAt).toLocaleString('en-AU'))
            setContentSaved(true)
            setTimeout(() => setContentSaved(false), 3000)
        } finally { setContentSaving(false) }
    }

    async function handleSendInduction() {
        if (!selectedMember || !context.trim()) return
        setSending(true); setSendError(null); setSendOk(false)
        try {
            const res = await fetch('/api/admin/dept-induction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dept,
                    userId: selectedMember.id,
                    userName: selectedMember.label,
                    context: context.trim(),
                    triggerLabel: triggerLabel.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) { setSendError(data.error || 'Failed to send'); return }
            setSendOk(true)
            setSelectedMember(null); setMemberSearch(''); setContext(''); setTriggerLabel('')
            setTimeout(() => setSendOk(false), 3000)
            loadRecords()
        } finally { setSending(false) }
    }

    const labelSx: React.CSSProperties = {
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em',
        textTransform: 'uppercase' as const, color: 'rgba(237,237,237,0.4)', marginBottom: 6, display: 'block',
    }
    const textareaSx: React.CSSProperties = {
        width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '10px 12px',
        fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' as const, outline: 'none',
        borderRadius: 0, boxSizing: 'border-box' as const,
    }
    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0, fontSize: '0.82rem', background: 'rgba(255,255,255,0.03)',
            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
            '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)' },
        '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem' },
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 32 }}>
            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                {deptLabel} — Induction Management
            </Typography>

            {/* ── Content Editor ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Typography fontSize='0.72rem' fontWeight={700} style={{ color: 'rgba(219,0,29,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Induction Content
                </Typography>
                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.4)', lineHeight: 1.6, marginTop: -12 }}>
                    This content is shown to members when they receive a {deptLabel} induction. If blank, the global staff induction content is used.
                </Typography>

                {contentError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{contentError}</Alert>}
                {contentSaved && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>Content saved.</Alert>}

                {contentLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                        <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={labelSx}>Part A — Rules Body</span>
                            <textarea rows={8} value={rulesBody} onChange={e => setRulesBody(e.target.value)}
                                placeholder='Leave blank to use global rules content…' style={textareaSx} />
                        </div>
                        <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={labelSx}>Part B — Tutorial Body (optional)</span>
                            <textarea rows={8} value={tutorialBody} onChange={e => setTutorialBody(e.target.value)}
                                placeholder='Leave blank to skip Part B…' style={textareaSx} />
                        </div>
                        <div className='flex items-center justify-between gap-4'>
                            {updatedAt && updatedByName ? (
                                <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)' }}>
                                    Last updated by {updatedByName} · {updatedAt}
                                </Typography>
                            ) : <div />}
                            <button disabled={contentSaving} onClick={handleSaveContent}
                                style={{
                                    all: 'unset', cursor: contentSaving ? 'not-allowed' : 'pointer',
                                    padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700,
                                    letterSpacing: '0.1em', textTransform: 'uppercase',
                                    background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)',
                                    color: contentSaving ? 'rgba(219,0,29,0.4)' : 'var(--red)',
                                }}>
                                {contentSaving ? 'Saving…' : 'Save Content'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Send Induction ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Typography fontSize='0.72rem' fontWeight={700} style={{ color: 'rgba(219,0,29,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Send Induction to Member
                </Typography>

                {sendError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{sendError}</Alert>}
                {sendOk && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.78rem' }} icon={<CheckCircle sx={{ fontSize: 16 }} />}>Induction sent.</Alert>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Autocomplete
                        options={memberOptions}
                        value={selectedMember}
                        onChange={(_, v) => setSelectedMember(v)}
                        inputValue={memberSearch}
                        onInputChange={(_, v) => setMemberSearch(v)}
                        getOptionLabel={o => o.label}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        noOptionsText={memberSearch ? 'No members found' : 'Type to search…'}
                        renderInput={params => <TextField {...params} label='Member' size='small' sx={inputSx} />}
                        sx={{ gridColumn: '1 / -1' }}
                    />
                    <TextField label='Context' size='small' value={context} onChange={e => setContext(e.target.value)}
                        placeholder='e.g. j3-appointment' sx={inputSx} />
                    <TextField label='Label (optional)' size='small' value={triggerLabel} onChange={e => setTriggerLabel(e.target.value)}
                        placeholder='e.g. Appointed to J3 Training Staff' sx={inputSx} />
                </div>
                <div>
                    <button
                        disabled={sending || !selectedMember || !context.trim()}
                        onClick={handleSendInduction}
                        style={{
                            all: 'unset', cursor: (sending || !selectedMember || !context.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)',
                            color: (sending || !selectedMember || !context.trim()) ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                        }}>
                        {sending ? <CircularProgress size={12} style={{ color: 'var(--red)' }} /> : <Send sx={{ fontSize: 14 }} />}
                        {sending ? 'Sending…' : 'Send Induction'}
                    </button>
                </div>
            </div>

            {/* ── Induction History ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Typography fontSize='0.72rem' fontWeight={700} style={{ color: 'rgba(219,0,29,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {deptLabel} Induction History
                </Typography>

                {listLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                        <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                    </div>
                ) : records.length === 0 ? (
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        No inductions sent for {deptLabel} yet.
                    </Typography>
                ) : (
                    <div style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Member', 'Context', 'Triggered by', 'Date', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => (
                                    <tr key={r._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.8)' }}>{r.userName}</td>
                                        <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>{r.triggerLabel || r.context}</td>
                                        <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>{r.triggeredByName}</td>
                                        <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>
                                            {new Date(r.triggeredAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{
                                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                                                padding: '2px 8px', borderRadius: 2,
                                                background: r.completedAt ? 'rgba(46,125,50,0.15)' : 'rgba(237,108,2,0.1)',
                                                color: r.completedAt ? 'rgba(100,220,100,0.8)' : 'rgba(255,167,38,0.8)',
                                                border: `1px solid ${r.completedAt ? 'rgba(46,125,50,0.3)' : 'rgba(237,108,2,0.3)'}`,
                                            }}>
                                                {r.completedAt ? 'Completed' : 'Pending'}
                                            </span>
                                        </td>
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
