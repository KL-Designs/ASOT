'use client'

import { useState, useEffect, useRef } from 'react'
import { TextField, Button, CircularProgress, Alert } from '@mui/material'
import { Send, CheckCircle, Warning } from '@mui/icons-material'

export default function JoinForm() {
    const [fields, setFields] = useState({
        discordUsername: '',
        inGameName: '',
        age: '',
        experience: '',
        website: '', // honeypot
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const name = fields.inGameName.trim()
        if (name.length < 2) { setNameStatus('idle'); return }

        setNameStatus('checking')
        if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current)
        nameCheckTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/applications/check-name?name=${encodeURIComponent(name)}`)
                const data = await res.json()
                setNameStatus(data.available ? 'available' : 'taken')
            } catch {
                setNameStatus('idle')
            }
        }, 500)
    }, [fields.inGameName])

    const handleChange = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFields(prev => ({ ...prev, [key]: e.target.value }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (nameStatus === 'taken') return
        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Something went wrong. Please try again.')
            } else {
                setSuccess(true)
            }
        } catch {
            setError('Network error. Please check your connection and try again.')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div
                className='flex flex-col items-center gap-4 p-8 text-center'
                style={{
                    border: '1px solid rgba(0,195,100,0.2)',
                    borderTop: '2px solid #00c364',
                    background: 'rgba(0,195,100,0.04)',
                }}
            >
                <CheckCircle style={{ fontSize: 48, color: '#00c364' }} />
                <div>
                    <div style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: '1rem', marginBottom: 8 }}>
                        APPLICATION SUBMITTED
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.55)', maxWidth: 400 }}>
                        Thank you for applying to ASOT. Our J1 Recruitment team will review your application and reach out via Discord.
                    </div>
                </div>
            </div>
        )
    }

    const nameHelperText = nameStatus === 'checking' ? 'Checking availability...'
        : nameStatus === 'available' ? '✓ Name is available'
        : nameStatus === 'taken' ? 'This name is already in use by an existing member.'
        : undefined

    const nameColor = nameStatus === 'available' ? '#00c364'
        : nameStatus === 'taken' ? '#db001d'
        : undefined

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.85rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.85rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    }

    const nameInputSx = {
        ...inputSx,
        ...(nameStatus === 'available' && {
            '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' },
        }),
        ...(nameStatus === 'taken' && {
            '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)' },
        }),
    }

    return (
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
            {/* Honeypot — hidden from real users */}
            <input
                type='text'
                name='website'
                value={fields.website}
                onChange={handleChange('website')}
                style={{ display: 'none' }}
                tabIndex={-1}
                autoComplete='off'
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <TextField
                    label='Discord Username'
                    placeholder='e.g. username or username#0000'
                    value={fields.discordUsername}
                    onChange={handleChange('discordUsername')}
                    required
                    fullWidth
                    sx={inputSx}
                />
                <TextField
                    label='In-Game Name'
                    placeholder='Your preferred name in-game'
                    value={fields.inGameName}
                    onChange={handleChange('inGameName')}
                    required
                    fullWidth
                    helperText={nameHelperText}
                    FormHelperTextProps={{ style: { color: nameColor, fontSize: '0.75rem', marginTop: 4 } }}
                    InputProps={{
                        endAdornment: nameStatus === 'checking'
                            ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                            : nameStatus === 'available'
                            ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                            : nameStatus === 'taken'
                            ? <Warning style={{ fontSize: 16, color: '#db001d' }} />
                            : undefined,
                    }}
                    sx={nameInputSx}
                />
            </div>

            <TextField
                label='Age'
                placeholder='Your age'
                type='number'
                value={fields.age}
                onChange={handleChange('age')}
                required
                inputProps={{ min: 13, max: 100 }}
                sx={inputSx}
            />

            <TextField
                label='Prior Military / Gaming Experience'
                placeholder='Tell us about your Arma experience, military background, other milsim units, etc.'
                value={fields.experience}
                onChange={handleChange('experience')}
                required
                multiline
                minRows={4}
                fullWidth
                inputProps={{ maxLength: 2000 }}
                helperText={`${fields.experience.length} / 2000`}
                sx={inputSx}
            />

            {error && (
                <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>
                    {error}
                </Alert>
            )}

            <Button
                type='submit'
                variant='contained'
                disabled={loading || nameStatus === 'taken' || nameStatus === 'checking'}
                endIcon={loading ? <CircularProgress size={16} color='inherit' /> : <Send />}
                sx={{
                    borderRadius: 0,
                    background: 'var(--red)',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    fontSize: '0.8rem',
                    padding: '10px 24px',
                    alignSelf: 'flex-start',
                    '&:hover': { background: 'rgba(219,0,29,0.85)' },
                    '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                }}
            >
                {loading ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}
            </Button>
        </form>
    )
}
