'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Checkbox, FormControlLabel, FormGroup,
} from '@mui/material'
import { Send, CheckCircle, Warning } from '@mui/icons-material'
import DeptInfoTabs from './DeptInfoTabs'
import { containsOffensiveWord } from '@/lib/offensive-words'

const REGIONS = ['Oceania', 'Asia', 'Europe', 'North America', 'South America', 'Middle East', 'Africa']
const NIGHTS = ['Saturday', 'Sunday', 'Both', 'Flexible']
const OPS_PER_MONTH = ['1+', '2+', '3+', '4+']
const PRIMARY_ROLES = [
    'Infantry', 'Section Medic', 'Advanced Medic',
    'Rotary Aviation', 'Fixed Wing Aviation', 'Armored Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]
const ADDITIONAL_ROLES = PRIMARY_ROLES
const DEPARTMENTS = [
    'J1 — Recruitment', 'J2 — Mission Making', 'J3 — Training',
    'J4 — Administration', 'J5 — Media',
    'J6 — Game Masters', 'J7 — Development',
]


// Estimated latency from our Sydney server to each region (ms)
const REGION_LATENCY: Record<string, number> = {
    'Oceania':       20,
    'Asia':         120,
    'North America': 200,
    'Europe':        270,
    'Middle East':   230,
    'South America': 330,
    'Africa':        370,
}

function LatencyBadge({ ms }: { ms: number }) {
    const [label, color] =
        ms < 80  ? ['Excellent', '#00c364'] :
        ms < 150 ? ['Good',      '#a3e635'] :
        ms < 250 ? ['Fair',      '#f59e0b'] :
                   ['High ping', '#ef4444']
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.7rem', fontWeight: 700, color,
            padding: '2px 8px',
            background: `${color}18`,
            border: `1px solid ${color}40`,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {ms}ms · {label}
        </span>
    )
}

// Shows the unit's standard op start time in the visitor's local timezone.
// Uses a fixed winter (no-DST) date so the conversion is stable year-round.
function OpTimesDisplay() {
    const [localFrom, setLocalFrom] = useState('')
    const [localTo,   setLocalTo]   = useState('')
    const [tz,        setTz]        = useState('')

    useEffect(() => {
        const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone
        const toLocal = (utcHour: number, utcMin: number) =>
            new Intl.DateTimeFormat('en', {
                hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTZ,
            }).format(new Date(Date.UTC(2025, 5, 7, utcHour, utcMin))) // Saturday in June

        // AEST = UTC+10 → 18:00 AEST = 08:00 UTC, 20:30 AEST = 10:30 UTC
        setLocalFrom(toLocal(8, 0))
        setLocalTo(toLocal(10, 30))
        setTz(
            new Intl.DateTimeFormat('en', { timeZoneName: 'short', timeZone: userTZ })
                .formatToParts(new Date())
                .find(p => p.type === 'timeZoneName')?.value ?? ''
        )
    }, [])

    if (!localFrom) return null
    return (
        <div style={{
            fontSize: '0.73rem', color: 'rgba(237,237,237,0.45)',
            padding: '8px 12px', marginBottom: 2,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            lineHeight: 1.6,
        }}>
            Our ops run <strong style={{ color: 'rgba(237,237,237,0.7)' }}>Saturday & Sunday nights</strong>, typically{' '}
            <strong style={{ color: 'rgba(237,237,237,0.7)' }}>{localFrom} – {localTo} {tz}</strong>.
            {' '}Platoon 1 on Saturdays, Platoon 2 on Sundays.
        </div>
    )
}

function SteamHelp() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
                type='button'
                onClick={() => setOpen(v => !v)}
                style={{
                    width: 15, height: 15, borderRadius: '50%',
                    border: '1px solid rgba(237,237,237,0.25)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(237,237,237,0.5)',
                    fontSize: '0.6rem', fontWeight: 700, lineHeight: 1,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}
                aria-label='Steam URL help'
            >
                ?
            </button>
            {open && (
                <div style={{
                    position: 'absolute', left: 0, top: 20, zIndex: 10,
                    width: 360, padding: '10px 12px',
                    background: '#1c1c1c', border: '1px solid rgba(219,0,29,0.3)',
                    fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6,
                }}>
                    <div style={{ fontWeight: 700, color: 'rgba(237,237,237,0.85)', marginBottom: 6 }}>Finding your Steam URL</div>
                    <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Open Steam and go to your profile page</li>
                        <li>Right-click anywhere on the page → <strong>&#8220;Copy Page URL&#8221;</strong></li>
                        <li>Paste the URL here — it will look like:<br />
                            <code style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)' }}>steamcommunity.com/id/yourname</code><br />
                            or <code style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)' }}>steamcommunity.com/profiles/76561…</code>
                        </li>
                    </ol>
                    <div style={{ marginTop: 8, color: 'rgba(237,237,237,0.35)', fontSize: '0.68rem' }}>
                        Then click <strong style={{ color: 'rgba(237,237,237,0.5)' }}>RESOLVE</strong> to look up your SteamID64.
                    </div>
                </div>
            )}
        </span>
    )
}

export default function JoinForm() {
    const [fields, setFields] = useState({
        discordUsername: '',
        inGameName: '',
        steamUrl: '',
        steamId64: '',
        age: '',
        region: '',
        armaHours: '',
        priorMilsim: false,
        dualClan: false,
        previousUnits: '',
        currentUnit: '',
        availableNights: '',
        opsPerMonth: '',
        primaryRole: '',
        additionalRoles: [] as string[],
        departmentInterest: [] as string[],
        ownsArma: false,
        experience: '',
        website: '', // honeypot
    })

    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState<string | null>(null)
    const [success,  setSuccess]  = useState(false)

    // Steam OpenID sign-in
    const searchParams = useSearchParams()
    const [steamAuthError, setSteamAuthError] = useState<string | null>(null)

    useEffect(() => {
        const steamId64 = searchParams.get('steamId64')
        const steamErr  = searchParams.get('steam_error')
        if (steamId64) {
            const url = `https://steamcommunity.com/profiles/${steamId64}`
            setFields(prev => ({ ...prev, steamUrl: url, steamId64 }))
            setSteamStatus('resolved')
            window.history.replaceState({}, '', '/join')
        }
        if (steamErr) {
            setSteamAuthError(steamErr === 'cancelled' ? 'Steam sign-in was cancelled.' : 'Steam sign-in failed. Please try again or paste your URL manually.')
            window.history.replaceState({}, '', '/join')
        }
    }, [searchParams])

    const handleSteamSignIn = useCallback(() => {
        const returnTo = `${window.location.origin}/api/applications/steam-callback`
        const realm    = window.location.origin
        const params = new URLSearchParams({
            'openid.ns':         'http://specs.openid.net/auth/2.0',
            'openid.mode':       'checkid_setup',
            'openid.return_to':  returnTo,
            'openid.realm':      realm,
            'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
            'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
        })
        window.location.href = `https://steamcommunity.com/openid/login?${params}`
    }, [])

    // Name availability check
    const [nameStatus,    setNameStatus]    = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameOffensive, setNameOffensive] = useState(false)
    const [nameSimilar,   setNameSimilar]   = useState<string[]>([])
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Steam ID64 resolution
    const [steamStatus,  setSteamStatus]  = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError,   setSteamError]   = useState<string | null>(null)
    const steamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Auto-resolve Steam ID64 when URL changes (debounced)
    useEffect(() => {
        const url = fields.steamUrl.trim()
        if (!url) { setSteamStatus('idle'); setSteamError(null); return }
        setSteamStatus('resolving')
        if (steamTimer.current) clearTimeout(steamTimer.current)
        steamTimer.current = setTimeout(async () => {
            setSteamError(null)
            try {
                const res = await fetch(`/api/applications/resolve-steam?url=${encodeURIComponent(url)}`)
                const data = await res.json()
                if (!res.ok) {
                    setSteamStatus('error')
                    setSteamError(data.error ?? 'Could not resolve Steam profile.')
                } else {
                    setFields(prev => ({ ...prev, steamId64: data.steamId64 }))
                    setSteamStatus('resolved')
                }
            } catch {
                setSteamStatus('error')
                setSteamError('Network error. Please try again.')
            }
        }, 700)
    }, [fields.steamUrl])

    // Region latency — derived from selected region
    const latency = REGION_LATENCY[fields.region] ?? null

    // Name check
    useEffect(() => {
        const name = fields.inGameName.trim()
        if (name.length < 2) { setNameStatus('idle'); setNameOffensive(false); setNameSimilar([]); return }

        setNameOffensive(containsOffensiveWord(name))

        setNameStatus('checking')
        if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current)
        nameCheckTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/applications/check-name?name=${encodeURIComponent(name)}`)
                const data = await res.json()
                setNameStatus(data.available ? 'available' : 'taken')
                setNameSimilar(data.similar ?? [])
            } catch { setNameStatus('idle') }
        }, 500)
    }, [fields.inGameName])


const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields(prev => ({ ...prev, [key]: e.target.value }))

    const setSelect = (key: string) => (value: string) =>
        setFields(prev => ({ ...prev, [key]: value }))

    const toggleCheck = (key: 'additionalRoles' | 'departmentInterest', value: string) =>
        setFields(prev => {
            const arr = prev[key] as string[]
            return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
        })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (nameStatus === 'taken' || nameOffensive) return
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

    const nameHelperText = nameOffensive ? 'This name contains offensive language.'
        : nameStatus === 'checking' ? 'Checking availability...'
        : nameStatus === 'available' ? '✓ Name is available'
        : nameStatus === 'taken' ? 'This name is already in use.'
        : undefined

    const nameColor = nameOffensive ? '#f59e0b'
        : nameStatus === 'available' ? '#00c364'
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

    const sectionLabel = (text: string, help?: string) => (
        <div style={{ marginTop: 8, marginBottom: help ? 6 : 4 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: help ? 4 : 0 }}>
                {text}
            </div>
            {help && (
                <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5 }}>
                    {help}
                </div>
            )}
        </div>
    )

    return (
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
            {/* Honeypot */}
            <input type='text' name='website' value={fields.website} onChange={set('website')} style={{ display: 'none' }} tabIndex={-1} autoComplete='off' />

            {/* ── Identity ── */}
            {sectionLabel('Identity', 'Enter your Discord username exactly as it appears. Your in-game name must be unique within the unit — it\'s how you\'ll be known in ops.')}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <TextField
                    label='Discord Username'
                    placeholder='e.g. username'
                    value={fields.discordUsername}
                    onChange={set('discordUsername')}
                    required fullWidth sx={inputSx}
                />
                <TextField
                    label='In-Game Name'
                    placeholder='e.g. Thomas, Six, Yoshi'
                    value={fields.inGameName}
                    onChange={set('inGameName')}
                    required fullWidth
                    inputProps={{ maxLength: 12 }}
                    helperText={nameHelperText}
                    FormHelperTextProps={{ style: { color: nameColor, fontSize: '0.75rem', marginTop: 4 } }}
                    InputProps={{
                        endAdornment: nameStatus === 'checking'
                            ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                            : nameOffensive             ? <Warning     style={{ fontSize: 16, color: '#f59e0b' }} />
                            : nameStatus === 'available' ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                            : nameStatus === 'taken'     ? <Warning     style={{ fontSize: 16, color: '#db001d' }} />
                            : undefined,
                    }}
                    sx={{
                        ...inputSx,
                        ...(nameOffensive              && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(245,158,11,0.6)' } }),
                        ...(nameStatus === 'available' && !nameOffensive && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' } }),
                        ...(nameStatus === 'taken'     && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)'  } }),
                    }}
                />
            </div>

            {/* Similar name warning */}
            {nameSimilar.length > 0 && nameStatus !== 'taken' && (
                <div style={{
                    fontSize: '0.75rem', color: '#f59e0b',
                    padding: '6px 10px',
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.25)',
                }}>
                    Your name is very similar to an existing member: <strong>{nameSimilar.join(', ')}</strong>. Please choose a more distinct name.
                </div>
            )}

            {/* Steam */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>Steam Profile URL or SteamID64</span>
                    <SteamHelp />
                </div>
                {steamAuthError && (
                    <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{steamAuthError}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                    <TextField
                        placeholder='https://steamcommunity.com/id/yourprofile'
                        value={fields.steamUrl}
                        onChange={e => setFields(prev => ({ ...prev, steamId64: '', steamUrl: e.target.value }))}
                        fullWidth sx={inputSx}
                        InputProps={{
                            endAdornment: steamStatus === 'resolving'
                                ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                                : steamStatus === 'resolved'
                                ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                                : undefined,
                        }}
                    />
                    <button
                        type='button'
                        onClick={handleSteamSignIn}
                        style={{
                            display: 'flex', alignItems: 'center',
                            padding: '0 12px', flexShrink: 0,
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(237,237,237,0.5)',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em',
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        SIGN IN WITH STEAM
                    </button>
                </div>
                {steamStatus === 'resolved' && (
                    <div style={{ fontSize: '0.72rem', color: '#00c364', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle style={{ fontSize: 14 }} />
                        SteamID64: <strong style={{ fontFamily: 'monospace' }}>{fields.steamId64}</strong>
                    </div>
                )}
                {steamStatus === 'error' && (
                    <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{steamError}</div>
                )}
            </div>

            {/* ── Background ── */}
            {sectionLabel('Background', 'Tell us about yourself — your age, where you\'re from, and your ARMA 3 experience.')}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <TextField
                    label='Age' placeholder='Your age' type='number'
                    value={fields.age} onChange={set('age')}
                    required inputProps={{ min: 13, max: 100 }} sx={inputSx}
                />
                <FormControl required sx={inputSx}>
                    <InputLabel>Region</InputLabel>
                    <Select
                        value={fields.region} label='Region'
                        onChange={e => setSelect('region')(e.target.value)}
                    >
                        {REGIONS.map(r => <MenuItem key={r} value={r} style={{ fontSize: '0.85rem' }}>{r}</MenuItem>)}
                    </Select>
                </FormControl>
                <TextField
                    label='ARMA 3 Hours' placeholder='e.g. 500'
                    value={fields.armaHours} onChange={set('armaHours')} sx={inputSx}
                />
                <FormControl sx={inputSx}>
                    <InputLabel>Own ARMA 3?</InputLabel>
                    <Select
                        value={fields.ownsArma ? 'yes' : 'no'} label='Own ARMA 3?'
                        onChange={e => setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
            </div>

            {!fields.ownsArma && (
                <div style={{
                    padding: '10px 14px', fontSize: '0.78rem',
                    color: '#ef4444', lineHeight: 1.5,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderLeft: '3px solid #ef4444',
                }}>
                    A legitimate copy of ARMA 3 is required to join ASOT. Applications cannot be submitted without it.
                </div>
            )}

            {/* Latency estimate */}
            {latency !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                    <span>Estimated latency to our server:</span>
                    <LatencyBadge ms={latency} />
                </div>
            )}

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormControl sx={inputSx}>
                    <InputLabel>Prior milsim experience?</InputLabel>
                    <Select
                        value={fields.priorMilsim ? 'yes' : 'no'} label='Prior milsim experience?'
                        onChange={e => setFields(prev => ({ ...prev, priorMilsim: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
                <FormControl sx={inputSx}>
                    <InputLabel>Part of another ARMA 3 unit?</InputLabel>
                    <Select
                        value={fields.dualClan ? 'yes' : 'no'} label='Part of another ARMA 3 unit?'
                        onChange={e => setFields(prev => ({ ...prev, dualClan: e.target.value === 'yes' }))}
                    >
                        <MenuItem value='yes'>Yes</MenuItem>
                        <MenuItem value='no'>No</MenuItem>
                    </Select>
                </FormControl>
            </div>

            {/* Separate previous / current unit fields */}
            {fields.priorMilsim && (
                <TextField
                    label='Previous units / groups'
                    placeholder='List any previous milsim units or groups you have been part of'
                    value={fields.previousUnits}
                    onChange={set('previousUnits')}
                    fullWidth multiline minRows={2}
                    inputProps={{ maxLength: 500 }} sx={inputSx}
                />
            )}
            {fields.dualClan && (
                <TextField
                    label='Current unit / group'
                    placeholder='List your current group(s)'
                    value={fields.currentUnit}
                    onChange={set('currentUnit')}
                    fullWidth multiline minRows={2}
                    inputProps={{ maxLength: 500 }} sx={inputSx}
                />
            )}

            {/* ── Availability ── */}
            {sectionLabel('Availability', 'Let us know when you\'re free. Consistent attendance is important — our ops run on a fixed schedule.')}
            <OpTimesDisplay />
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormControl required sx={inputSx}>
                    <InputLabel>Available operation nights</InputLabel>
                    <Select value={fields.availableNights} label='Available operation nights' onChange={e => setSelect('availableNights')(e.target.value)}>
                        {NIGHTS.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={inputSx}>
                    <InputLabel>Operations per month (approx.)</InputLabel>
                    <Select value={fields.opsPerMonth} label='Operations per month (approx.)' onChange={e => setSelect('opsPerMonth')(e.target.value)}>
                        {OPS_PER_MONTH.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </Select>
                </FormControl>
            </div>

            {/* ── Role Interest ── */}
            {sectionLabel('Role Interest', 'Pick your preferred role. All new members receive onboarding — you\'ll be trained before being assigned to a section.')}
            <FormControl required sx={inputSx}>
                <InputLabel>Primary role</InputLabel>
                <Select value={fields.primaryRole} label='Primary role' onChange={e => setSelect('primaryRole')(e.target.value)}>
                    {PRIMARY_ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
            </FormControl>

            <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Additional role interests (optional)</div>
                <FormGroup row sx={{ gap: 0 }}>
                    {ADDITIONAL_ROLES.map(r => (
                        <FormControlLabel key={r}
                            control={<Checkbox size='small' checked={fields.additionalRoles.includes(r)} onChange={() => toggleCheck('additionalRoles', r)} sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }} />}
                            label={<span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)' }}>{r}</span>}
                            sx={{ marginRight: 2, marginBottom: 0.5 }}
                        />
                    ))}
                </FormGroup>
            </div>

            <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Department interest (optional)</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', marginBottom: 8 }}>Departments are staff roles outside of regular ops. See the department info below for details.</div>
                <FormGroup row sx={{ gap: 0 }}>
                    {DEPARTMENTS.map(d => (
                        <FormControlLabel key={d}
                            control={<Checkbox size='small' checked={fields.departmentInterest.includes(d)} onChange={() => toggleCheck('departmentInterest', d)} sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }} />}
                            label={<span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)' }}>{d}</span>}
                            sx={{ marginRight: 2, marginBottom: 0.5 }}
                        />
                    ))}
                </FormGroup>
            </div>

            <DeptInfoTabs />

            {/* ── About You ── */}
            {sectionLabel('About You', 'Give us some context. Why do you want to join ASOT? What\'s your background in ARMA or milsim? The more detail, the better.')}
            <TextField
                label='Prior Military / Gaming Experience'
                placeholder='Tell us about your Arma experience, military background, other milsim units, etc.'
                value={fields.experience}
                onChange={set('experience')}
                required multiline minRows={4} fullWidth
                inputProps={{ maxLength: 2000 }}
                helperText={`${fields.experience.length} / 2000`}
                sx={inputSx}
            />

            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}

            <Button
                type='submit' variant='contained'
                disabled={loading || nameStatus === 'taken' || nameStatus === 'checking' || !fields.ownsArma}
                endIcon={loading ? <CircularProgress size={16} color='inherit' /> : <Send />}
                sx={{
                    borderRadius: 0, background: 'var(--red)',
                    fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.8rem',
                    padding: '10px 24px',
                    '&:hover': { background: 'rgba(219,0,29,0.85)' },
                    '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                }}
            >
                {loading ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}
            </Button>
        </form>
    )
}
