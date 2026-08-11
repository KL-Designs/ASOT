'use client'

import { useEffect, useState } from 'react'
import { TextField, MenuItem, Typography } from '@mui/material'

const ALL_TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.15)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.02)',
}

const headerStyle = {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
}

export default function TimezoneSelector({ initialTimezone }: { initialTimezone: string | null }) {
    const [timezone, setTimezone] = useState(initialTimezone ?? '')
    const [saving, setSaving] = useState(false)
    const [autoDetected, setAutoDetected] = useState(false)

    async function saveTimezone(value: string) {
        setTimezone(value)
        setSaving(true)
        await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: value }),
        })
        setSaving(false)
    }

    // Auto-detect once on mount if the user has no timezone saved yet. Runs only
    // when initialTimezone was null/empty at page load — deliberately excluded
    // from the dependency array so it never re-fires after the user picks one.
    useEffect(() => {
        if (initialTimezone) return
        const detected = typeof Intl.DateTimeFormat === 'function'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : null
        if (detected && ALL_TIMEZONES.includes(detected)) {
            setAutoDetected(true)
            saveTimezone(detected)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleChange(value: string) {
        setAutoDetected(false)
        saveTimezone(value)
    }

    return (
        <div style={cardStyle}>
            <div className='flex items-center px-4 py-3' style={headerStyle}>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                    Timezone
                </Typography>
            </div>
            <div className='p-5'>
                <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.5)', marginBottom: 10 }}>
                    Used to interpret times you enter when creating reminders, on both the website and the Discord bot.
                </Typography>
                {autoDetected && (
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(63,174,92,0.85)', marginBottom: 8 }}>
                        Detected as {timezone.replace(/_/g, ' ')} from your browser — change it below if that&apos;s wrong.
                    </Typography>
                )}
                <TextField
                    select
                    size='small'
                    fullWidth
                    value={timezone}
                    onChange={e => handleChange(e.target.value)}
                    disabled={saving}
                    placeholder='Select your timezone…'
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 0,
                            fontSize: '0.85rem',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.3)' },
                            '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.5)', borderWidth: 1 },
                        },
                    }}
                >
                    {!timezone && <MenuItem value='' disabled>Select your timezone…</MenuItem>}
                    {ALL_TIMEZONES.map(tz => (
                        <MenuItem key={tz} value={tz} sx={{ fontSize: '0.82rem' }}>{tz.replace(/_/g, ' ')}</MenuItem>
                    ))}
                </TextField>
            </div>
        </div>
    )
}
