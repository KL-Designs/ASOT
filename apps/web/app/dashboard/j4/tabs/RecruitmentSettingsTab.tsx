'use client'

import { useState, useEffect } from 'react'
import { Typography, Switch, FormControlLabel, CircularProgress } from '@mui/material'

export default function RecruitmentSettingsTab() {
    const [showInfoPage, setShowInfoPage] = useState(true)
    const [loading,      setLoading]      = useState(true)
    const [saving,       setSaving]       = useState(false)

    useEffect(() => {
        fetch('/api/admin/recruitment-settings')
            .then(r => r.json())
            .then(d => { setShowInfoPage(d.showInfoPage ?? true) })
            .finally(() => setLoading(false))
    }, [])

    async function toggle(val: boolean) {
        setShowInfoPage(val)
        setSaving(true)
        await fetch('/api/admin/recruitment-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ showInfoPage: val }),
        })
        setSaving(false)
    }

    if (loading) return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} style={{ color: 'var(--red)' }} />
        </div>
    )

    return (
        <div style={{ padding: '32px 40px', maxWidth: 600 }}>
            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 24 }}>
                Recruitment Settings
            </Typography>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Info page toggle */}
                <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                        <div>
                            <Typography fontSize='0.8rem' fontWeight={700} style={{ color: 'rgba(237,237,237,0.85)', marginBottom: 4 }}>
                                Pre-Application Information Page
                            </Typography>
                            <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                                When enabled, applicants are shown an information page about the unit&apos;s training process and Selection &amp; Reinforcement Cycle after the recruitment video and before the application form. The page includes a 10-second acknowledgment timer.
                            </Typography>
                            <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)', marginTop: 8 }}>
                                Flow when ON:&nbsp; Video → Info Page → Application<br />
                                Flow when OFF:&nbsp; Video → Application
                            </Typography>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showInfoPage}
                                        onChange={e => toggle(e.target.checked)}
                                        disabled={saving}
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                        }}
                                    />
                                }
                                label={
                                    <Typography fontSize='0.68rem' fontWeight={700} style={{ color: showInfoPage ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                        {saving ? 'Saving…' : showInfoPage ? 'Enabled' : 'Disabled'}
                                    </Typography>
                                }
                                labelPlacement='start'
                                sx={{ margin: 0 }}
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
