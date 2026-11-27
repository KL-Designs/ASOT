'use client'

import { useState, useEffect } from 'react'
import { Typography, CircularProgress, Alert } from '@mui/material'

export default function InductionContentTab() {
    const [rulesBody, setRulesBody]     = useState('')
    const [tutorialBody, setTutorialBody] = useState('')
    const [loading, setLoading]         = useState(true)
    const [saving, setSaving]           = useState(false)
    const [saved, setSaved]             = useState(false)
    const [error, setError]             = useState<string | null>(null)
    const [updatedByName, setUpdatedByName] = useState<string | null>(null)
    const [updatedAt, setUpdatedAt]     = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/admin/staff-induction-content')
            .then(r => r.json())
            .then(d => {
                if (d.content) {
                    setRulesBody(d.content.rulesBody ?? '')
                    setTutorialBody(d.content.tutorialBody ?? '')
                    setUpdatedByName(d.content.updatedByName ?? null)
                    setUpdatedAt(d.content.updatedAt ? new Date(d.content.updatedAt).toLocaleString('en-AU') : null)
                }
            })
            .catch(() => setError('Failed to load content'))
            .finally(() => setLoading(false))
    }, [])

    async function handleSave() {
        setSaving(true); setError(null); setSaved(false)
        try {
            const res = await fetch('/api/admin/staff-induction-content', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rulesBody, tutorialBody }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Save failed'); return }
            if (data.content?.updatedByName) setUpdatedByName(data.content.updatedByName)
            if (data.content?.updatedAt) setUpdatedAt(new Date(data.content.updatedAt).toLocaleString('en-AU'))
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } finally {
            setSaving(false)
        }
    }

    const labelSx: React.CSSProperties = {
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em',
        textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6, display: 'block',
    }
    const textareaSx: React.CSSProperties = {
        width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '10px 12px',
        fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none',
        borderRadius: 0, boxSizing: 'border-box',
    }

    if (loading) return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} style={{ color: 'var(--red)' }} />
        </div>
    )

    return (
        <div style={{ padding: '32px 40px', maxWidth: 700 }}>
            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 24 }}>
                Staff Induction Content
            </Typography>

            <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.45)', marginBottom: 24, lineHeight: 1.6 }}>
                Edit the text shown to members during their staff induction. Part A (rules) is mandatory.
                Part B (tutorial) is optional — if left blank, it will not be shown and the induction will
                complete after Part A.
            </Typography>

            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem', mb: 2 }}>{error}</Alert>}
            {saved && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.78rem', mb: 2 }}>Content saved successfully.</Alert>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Part A */}
                <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography fontSize='0.72rem' fontWeight={700} style={{ color: 'rgba(219,0,29,0.7)', marginBottom: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Part A — Rules &amp; Standards
                    </Typography>
                    <span style={labelSx}>Rules Body</span>
                    <textarea
                        rows={12}
                        value={rulesBody}
                        onChange={e => setRulesBody(e.target.value)}
                        placeholder='Enter the staff rules and standards text that members must acknowledge...'
                        style={textareaSx}
                    />
                </div>

                {/* Part B */}
                <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography fontSize='0.72rem' fontWeight={700} style={{ color: 'rgba(237,237,237,0.5)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Part B — Orientation Tutorial
                    </Typography>
                    <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                        Optional. Leave blank to skip Part B entirely.
                    </Typography>
                    <span style={labelSx}>Tutorial Body</span>
                    <textarea
                        rows={12}
                        value={tutorialBody}
                        onChange={e => setTutorialBody(e.target.value)}
                        placeholder='Enter optional orientation tutorial content...'
                        style={textareaSx}
                    />
                </div>

                {/* Footer */}
                <div className='flex items-center justify-between gap-4'>
                    {updatedAt && updatedByName ? (
                        <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)' }}>
                            Last updated by {updatedByName} · {updatedAt}
                        </Typography>
                    ) : <div />}
                    <button
                        disabled={saving}
                        onClick={handleSave}
                        style={{
                            all: 'unset', cursor: saving ? 'not-allowed' : 'pointer',
                            padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)',
                            color: saving ? 'rgba(219,0,29,0.4)' : 'var(--red)',
                        }}
                    >
                        {saving ? 'Saving…' : 'Save Content'}
                    </button>
                </div>
            </div>
        </div>
    )
}
