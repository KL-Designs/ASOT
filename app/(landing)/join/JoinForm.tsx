'use client'

import { useState, useEffect, useRef } from 'react'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Checkbox, FormControlLabel, FormGroup,
} from '@mui/material'
import { Send, CheckCircle, Warning } from '@mui/icons-material'

const REGIONS = ['Oceania', 'North America', 'Europe', 'Asia', 'Other']

const NIGHTS = ['Saturday', 'Sunday', 'Both', 'Flexible']

const OPS_PER_MONTH = ['1+', '2+', '3+', '4+']

const PRIMARY_ROLES = [
    'Infantry', 'Section Medic', 'Advanced Medic',
    'Rotary Aviation', 'Fixed Wing Aviation', 'Armored Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]

const ADDITIONAL_ROLES = PRIMARY_ROLES

const DEPARTMENTS = ['J1 — Recruitment', 'J2 — Mission Making', 'J3 — Training', 'J6 — Game Masters', 'J7 — Development']

export default function JoinForm() {
    const [fields, setFields] = useState({
        discordUsername: '',
        inGameName: '',
        steamUrl: '',
        age: '',
        region: '',
        armaHours: '',
        priorMilsim: false,
        dualClan: false,
        previousUnits: '',
        availableNights: '',
        opsPerMonth: '',
        primaryRole: '',
        additionalRoles: [] as string[],
        departmentInterest: [] as string[],
        ownsArma: false,
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

    const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields(prev => ({ ...prev, [key]: e.target.value }))

    const setSelect = (key: string) => (value: string) =>
        setFields(prev => ({ ...prev, [key]: value }))

    const toggleCheck = (key: 'additionalRoles' | 'departmentInterest', value: string) => {
        setFields(prev => {
            const arr = prev[key] as string[]
            return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
        })
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
        '& .MuiSelect-select': { fontSize: '0.85rem' },
    }

    const sectionLabel = (text: string) => (
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginTop: 8, marginBottom: 4 }}>
            {text}
        </div>
    )

    return (
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
            {/* Honeypot */}
            <input type='text' name='website' value={fields.website} onChange={set('website')} style={{ display: 'none' }} tabIndex={-1} autoComplete='off' />

            {/* ── Identity ── */}
            {sectionLabel('Identity')}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <TextField
                    label='Discord Username'
                    placeholder='e.g. username or username#0000'
                    value={fields.discordUsername}
                    onChange={set('discordUsername')}
                    required
                    fullWidth
                    sx={inputSx}
                />
                <TextField
                    label='In-Game Name'
                    placeholder='Your preferred name in-game'
                    value={fields.inGameName}
                    onChange={set('inGameName')}
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
                    sx={{
                        ...inputSx,
                        ...(nameStatus === 'available' && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' } }),
                        ...(nameStatus === 'taken' && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)' } }),
                    }}
                />
            </div>
            <TextField
                label='Steam Profile URL'
                placeholder='https://steamcommunity.com/id/yourprofile'
                value={fields.steamUrl}
                onChange={set('steamUrl')}
                fullWidth
                sx={inputSx}
            />

            {/* ── Background ── */}
            {sectionLabel('Background')}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <TextField
                    label='Age'
                    placeholder='Your age'
                    type='number'
                    value={fields.age}
                    onChange={set('age')}
                    required
                    inputProps={{ min: 13, max: 100 }}
                    sx={inputSx}
                />
                <FormControl required sx={inputSx}>
                    <InputLabel>Region</InputLabel>
                    <Select
                        value={fields.region}
                        label='Region'
                        onChange={e => setSelect('region')(e.target.value)}
                    >
                        {REGIONS.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </Select>
                </FormControl>
                <TextField
                    label='ARMA 3 Hours'
                    placeholder='e.g. 500'
                    value={fields.armaHours}
                    onChange={set('armaHours')}
                    sx={inputSx}
                />
                <FormControl sx={inputSx}>
                    <InputLabel>Do you own ARMA 3?</InputLabel>
                    <Select
                        value={fields.ownsArma === true ? 'yes' : fields.ownsArma === false ? 'no' : ''}
                        label='Do you own ARMA 3?'
                        onChange={e => setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormControl sx={inputSx}>
                    <InputLabel>Prior milsim experience?</InputLabel>
                    <Select
                        value={fields.priorMilsim ? 'yes' : 'no'}
                        label='Prior milsim experience?'
                        onChange={e => setFields(prev => ({ ...prev, priorMilsim: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
                <FormControl sx={inputSx}>
                    <InputLabel>Part of another ARMA 3 milsim unit?</InputLabel>
                    <Select
                        value={fields.dualClan ? 'yes' : 'no'}
                        label='Part of another ARMA 3 milsim unit?'
                        onChange={e => setFields(prev => ({ ...prev, dualClan: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
            </div>
            {(fields.priorMilsim || fields.dualClan) && (
                <TextField
                    label='Previous units / groups'
                    placeholder='List any previous units or groups you have been part of'
                    value={fields.previousUnits}
                    onChange={set('previousUnits')}
                    fullWidth
                    inputProps={{ maxLength: 500 }}
                    sx={inputSx}
                />
            )}

            {/* ── Availability ── */}
            {sectionLabel('Availability')}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormControl required sx={inputSx}>
                    <InputLabel>Available operation nights</InputLabel>
                    <Select
                        value={fields.availableNights}
                        label='Available operation nights'
                        onChange={e => setSelect('availableNights')(e.target.value)}
                    >
                        {NIGHTS.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={inputSx}>
                    <InputLabel>Operations per month (approx.)</InputLabel>
                    <Select
                        value={fields.opsPerMonth}
                        label='Operations per month (approx.)'
                        onChange={e => setSelect('opsPerMonth')(e.target.value)}
                    >
                        {OPS_PER_MONTH.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </Select>
                </FormControl>
            </div>

            {/* ── Role Interest ── */}
            {sectionLabel('Role Interest')}
            <FormControl required sx={inputSx}>
                <InputLabel>Primary role</InputLabel>
                <Select
                    value={fields.primaryRole}
                    label='Primary role'
                    onChange={e => setSelect('primaryRole')(e.target.value)}
                >
                    {PRIMARY_ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
            </FormControl>

            <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Additional role interests (optional)</div>
                <FormGroup row sx={{ gap: 0 }}>
                    {ADDITIONAL_ROLES.map(r => (
                        <FormControlLabel
                            key={r}
                            control={
                                <Checkbox
                                    size='small'
                                    checked={fields.additionalRoles.includes(r)}
                                    onChange={() => toggleCheck('additionalRoles', r)}
                                    sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }}
                                />
                            }
                            label={<span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)' }}>{r}</span>}
                            sx={{ marginRight: 2, marginBottom: 0.5 }}
                        />
                    ))}
                </FormGroup>
            </div>

            <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Department interest (optional)</div>
                <FormGroup row sx={{ gap: 0 }}>
                    {DEPARTMENTS.map(d => (
                        <FormControlLabel
                            key={d}
                            control={
                                <Checkbox
                                    size='small'
                                    checked={fields.departmentInterest.includes(d)}
                                    onChange={() => toggleCheck('departmentInterest', d)}
                                    sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }}
                                />
                            }
                            label={<span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)' }}>{d}</span>}
                            sx={{ marginRight: 2, marginBottom: 0.5 }}
                        />
                    ))}
                </FormGroup>
            </div>

            {/* ── Experience ── */}
            {sectionLabel('About You')}
            <TextField
                label='Prior Military / Gaming Experience'
                placeholder='Tell us about your Arma experience, military background, other milsim units, etc.'
                value={fields.experience}
                onChange={set('experience')}
                required
                multiline
                minRows={4}
                fullWidth
                inputProps={{ maxLength: 2000 }}
                helperText={`${fields.experience.length} / 2000`}
                sx={inputSx}
            />

            {error && (
                <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>
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
