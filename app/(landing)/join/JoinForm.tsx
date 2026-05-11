'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Checkbox, FormControlLabel, FormGroup,
} from '@mui/material'
import { Send, CheckCircle, Warning, ArrowForward, ArrowBack } from '@mui/icons-material'
import DeptInfoTabs from './DeptInfoTabs'
import { containsOffensiveWord } from '@/lib/offensive-words'

const REGIONS = ['Oceania', 'Asia', 'Europe', 'North America', 'South America', 'Middle East', 'Africa']
const NIGHTS = ['Saturday', 'Sunday', 'Both', 'Flexible']
const OPS_PER_MONTH = ['1+', '2+', '3+', '4+']
const PRIMARY_ROLES = [
    'Infantry', 'Combat First Aider (CFA)', 'Advanced Medic',
    'Rotary Aviation', 'Armoured Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]
const ADDITIONAL_ROLES = PRIMARY_ROLES
const DEPARTMENTS = [
    'J1 — Recruitment', 'J2 — Mission Making', 'J3 — Training',
    'J4 — Company Headquarters', 'J5 — Media',
    'J6 — Gamemasters (Zeus)', 'J7 — Community Development',
]

const REGION_LATENCY: Record<string, number> = {
    'Oceania':        20,
    'Asia':          120,
    'North America':  200,
    'Europe':         270,
    'Middle East':    230,
    'South America':  330,
    'Africa':         370,
}

const STEP_LABELS = ['Discord', 'Steam', 'Identity', 'Background', 'Availability', 'Roles', 'About You']

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

function OpTimesDisplay() {
    const [loadIn, setLoadIn] = useState('')
    const [end,    setEnd]    = useState('')
    const [tz,     setTz]     = useState('')

    useEffect(() => {
        const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone

        // Detect if Australia/Sydney is currently in DST (AEDT, UTC+11) or standard (AEST, UTC+10)
        const nowOffset = -new Date().getTimezoneOffset() // user offset doesn't help; use Sydney directly
        const sydneyOffset = (() => {
            const parts = new Intl.DateTimeFormat('en', {
                timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset',
            }).formatToParts(new Date())
            const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+10'
            const m = raw.match(/GMT([+-])(\d+)(?::(\d+))?/)
            if (!m) return 10
            return (m[1] === '-' ? -1 : 1) * (parseInt(m[2]) + (parseInt(m[3] ?? '0') / 60))
        })()
        const isDst = sydneyOffset === 11

        // Standard (AEST UTC+10): load-in 18:00 → UTC 08:00, end 21:00 → UTC 11:00
        // Daylight (AEDT UTC+11): load-in 18:30 → UTC 07:30, end 21:00 → UTC 10:00
        const [liH, liM] = isDst ? [7, 30] : [8, 0]
        const [enH, enM] = isDst ? [10, 0] : [11, 0]

        const fmt = (h: number, m: number) =>
            new Intl.DateTimeFormat('en', {
                hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTZ,
            }).format(new Date(Date.UTC(2025, 5, 7, h, m)))

        setLoadIn(fmt(liH, liM))
        setEnd(fmt(enH, enM))
        setTz(
            new Intl.DateTimeFormat('en', { timeZoneName: 'short', timeZone: userTZ })
                .formatToParts(new Date())
                .find(p => p.type === 'timeZoneName')?.value ?? ''
        )
    }, [])

    if (!loadIn) return null
    return (
        <div style={{
            fontSize: '0.73rem', color: 'rgba(237,237,237,0.45)',
            padding: '8px 12px', marginBottom: 2,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            lineHeight: 1.6,
        }}>
            Ops run <strong style={{ color: 'rgba(237,237,237,0.7)' }}>Saturday & Sunday nights</strong>.{' '}
            Members load in at <strong style={{ color: 'rgba(237,237,237,0.7)' }}>{loadIn}</strong>, mission ends around{' '}
            <strong style={{ color: 'rgba(237,237,237,0.7)' }}>{end} {tz}</strong>.{' '}<br/>
            1 Platoon operates Saturdays, 2 Platoon operates on Sundays. 3 Platoon supports both nights.
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
            >?</button>
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

                </div>
            )}
        </span>
    )
}

export default function JoinForm() {
    const [step, setStep] = useState(1)

    const [fields, setFields] = useState({
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
        ownsArma: true,
        experience: '',
        website: '',
    })

    const isDev = process.env.NODE_ENV === 'development'

    const [loading,      setLoading]      = useState(false)
    const [error,        setError]        = useState<string | null>(null)
    const [success,      setSuccess]      = useState(false)
    const [discord,      setDiscord]      = useState<{ id: string; username: string; globalName: string; avatar: string } | null>(null)
    const [discordError, setDiscordError] = useState<string | null>(null)
    const [steamAuthError, setSteamAuthError] = useState<string | null>(null)
    const [nameStatus,   setNameStatus]   = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameOffensive, setNameOffensive] = useState(false)
    const [nameSimilar,  setNameSimilar]  = useState<string[]>([])
    const [steamStatus,  setSteamStatus]  = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError,   setSteamError]   = useState<string | null>(null)

    const nameCheckTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
    const steamTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
    const armaHoursTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [armaHoursAlert, setArmaHoursAlert] = useState(false)
    const searchParams   = useSearchParams()

    // Restore existing Discord session on mount
    useEffect(() => {
        fetch('/api/applications/discord-session')
            .then(r => r.json())
            .then(d => { if (d.verified) setDiscord(d) })
            .catch(() => {})
    }, [])

    // Handle OAuth redirects back to /join
    useEffect(() => {
        const discordVerified = searchParams.get('discord_verified')
        const discordErr      = searchParams.get('discord_error')
        const steamId64Param  = searchParams.get('steamId64')
        const steamErr        = searchParams.get('steam_error')

        if (discordVerified) {
            fetch('/api/applications/discord-session')
                .then(r => r.json())
                .then(d => { if (d.verified) { setDiscord(d); setStep(2) } })
                .catch(() => {})
            window.history.replaceState({}, '', '/join')
        }
        if (discordErr) {
            setDiscordError(
                discordErr === 'not_member'    ? 'You must join the ASOT Discord server (discord.gg/asot) before applying.' :
                discordErr === 'already_member'? 'You are already a member of ASOT. Contact a J1 staff member on Discord if you need help.' :
                discordErr === 'cancelled'     ? 'Discord sign-in was cancelled.' :
                                                 'Discord sign-in failed. Please try again.'
            )
            window.history.replaceState({}, '', '/join')
        }
        if (steamId64Param) {
            setFields(prev => ({ ...prev, steamUrl: `https://steamcommunity.com/profiles/${steamId64Param}`, steamId64: steamId64Param }))
            setSteamStatus('resolved')
            setStep(3)
            window.history.replaceState({}, '', '/join')
        }
        if (steamErr) {
            setSteamAuthError(steamErr === 'cancelled' ? 'Steam sign-in was cancelled.' : 'Steam sign-in failed. Please try again or paste your URL manually.')
            window.history.replaceState({}, '', '/join')
        }
    }, [searchParams])

    const handleSteamSignIn = useCallback(() => {
        const base     = process.env.NEXT_PUBLIC_BASEURL ?? window.location.origin
        const returnTo = `${base}/api/applications/steam-callback`
        const realm    = base
        const params   = new URLSearchParams({
            'openid.ns':         'http://specs.openid.net/auth/2.0',
            'openid.mode':       'checkid_setup',
            'openid.return_to':  returnTo,
            'openid.realm':      realm,
            'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
            'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
        })
        window.location.href = `https://steamcommunity.com/openid/login?${params}`
    }, [])

    // Debounced Steam URL resolution
    useEffect(() => {
        const url = fields.steamUrl.trim()
        if (!url) { setSteamStatus('idle'); setSteamError(null); return }
        setSteamStatus('resolving')
        if (steamTimer.current) clearTimeout(steamTimer.current)
        steamTimer.current = setTimeout(async () => {
            setSteamError(null)
            try {
                const res  = await fetch(`/api/applications/resolve-steam?url=${encodeURIComponent(url)}`)
                const data = await res.json()
                if (!res.ok) { setSteamStatus('error'); setSteamError(data.error ?? 'Could not resolve Steam profile.') }
                else         { setFields(prev => ({ ...prev, steamId64: data.steamId64 })); setSteamStatus('resolved') }
            } catch { setSteamStatus('error'); setSteamError('Network error. Please try again.') }
        }, 700)
    }, [fields.steamUrl])

    // Debounced name check
    useEffect(() => {
        const name = fields.inGameName.trim()
        if (name.length < 2) { setNameStatus('idle'); setNameOffensive(false); setNameSimilar([]); return }
        setNameOffensive(containsOffensiveWord(name))
        setNameStatus('checking')
        if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current)
        nameCheckTimer.current = setTimeout(async () => {
            try {
                const res  = await fetch(`/api/applications/check-name?name=${encodeURIComponent(name)}`)
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
        if (!discord || nameStatus === 'taken' || nameOffensive) return
        setLoading(true); setError(null)
        try {
            const res  = await fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
            const data = await res.json()
            if (!res.ok) setError(data.error || 'Something went wrong. Please try again.')
            else         setSuccess(true)
        } catch { setError('Network error. Please check your connection and try again.') }
        finally  { setLoading(false) }
    }

    if (success) return (
        <div className='flex flex-col items-center gap-4 p-8 text-center' style={{ border: '1px solid rgba(0,195,100,0.2)', borderTop: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}>
            <CheckCircle style={{ fontSize: 48, color: '#00c364' }} />
            <div>
                <div style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: '1rem', marginBottom: 8 }}>APPLICATION SUBMITTED</div>
                <div style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.55)', maxWidth: 400 }}>
                    Thank you for applying to ASOT. Our J1 Recruitment team will review your application and reach out via Discord.
                </div>
            </div>
        </div>
    )

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0, fontSize: '0.85rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.85rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
        '& .MuiSelect-select': { fontSize: '0.85rem' },
    }

    const sectionLabel = (text: string, help?: string) => (
        <div style={{ marginBottom: help ? 6 : 4 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: help ? 4 : 0 }}>
                {text}
            </div>
            {help && <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5 }}>{help}</div>}
        </div>
    )

    const isStepComplete = (s: number): boolean => {
        switch (s) {
            case 1: return !!discord
            case 2: return steamStatus === 'resolved'
            case 3: return !!fields.inGameName.trim() && nameStatus === 'available' && !nameOffensive
            case 4: return !!fields.age && !!fields.region
            case 5: return !!fields.availableNights && !!fields.opsPerMonth
            case 6: return !!fields.primaryRole
            default: return true
        }
    }

    const canAdvance = (): boolean => isStepComplete(step)

    function handleStepClick(targetStep: number) {
        if (targetStep === step) return
        if (targetStep < step) { setStep(targetStep); return }
        // Going forward: all steps up to target must be complete
        for (let s = 1; s < targetStep; s++) {
            if (!isStepComplete(s)) return
        }
        setStep(targetStep)
    }

    const progressBar = (
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
            {STEP_LABELS.map((label, i) => {
                const stepNum   = i + 1
                const isDone    = stepNum < step
                const isActive  = stepNum === step
                const isFirst   = i === 0
                const isLast    = i === STEP_LABELS.length - 1
                // A future step is reachable only if all steps before it are complete
                const reachable = stepNum < step || (stepNum > step && (() => {
                    for (let s = 1; s < stepNum; s++) { if (!isStepComplete(s)) return false }
                    return true
                })())
                const clickable = !isActive && reachable
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <div style={{ height: 1, flex: 1, marginBottom: 18, background: isFirst ? 'transparent' : isDone ? 'rgba(0,195,100,0.4)' : 'rgba(255,255,255,0.07)' }} />
                        <div
                            onClick={clickable ? () => handleStepClick(stepNum) : undefined}
                            title={clickable ? `Go to ${label}` : undefined}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                flex: '0 0 auto',
                                cursor: clickable ? 'pointer' : 'default',
                                opacity: !reachable && !isDone && !isActive ? 0.5 : 1,
                                transition: 'opacity 0.15s',
                            }}
                        >
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 700,
                                background: isDone ? '#00c364' : isActive ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.05)',
                                border: isDone ? '1px solid #00c364' : isActive ? '1px solid var(--red)' : '1px solid rgba(255,255,255,0.1)',
                                color: isDone ? '#fff' : isActive ? 'var(--red)' : 'rgba(237,237,237,0.25)',
                                transition: 'box-shadow 0.15s',
                                boxShadow: clickable ? '0 0 0 0 transparent' : undefined,
                            }}
                                onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.boxShadow = isDone ? '0 0 6px rgba(0,195,100,0.4)' : '0 0 6px rgba(219,0,29,0.3)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 0 transparent' }}
                            >
                                {isDone ? '✓' : stepNum}
                            </div>
                            <span style={{
                                fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.06em',
                                textTransform: 'uppercase', whiteSpace: 'nowrap',
                                color: isDone ? '#00c364' : isActive ? 'rgba(237,237,237,0.7)' : 'rgba(237,237,237,0.2)',
                            }}>
                                {label}
                            </span>
                        </div>
                        <div style={{ height: 1, flex: 1, marginBottom: 18, background: isLast ? 'transparent' : isDone ? 'rgba(0,195,100,0.4)' : 'rgba(255,255,255,0.07)' }} />
                    </div>
                )
            })}
        </div>
    )

    const backBtn = step > 1 && (
        <Button
            type='button'
            onClick={() => setStep(s => s - 1)}
            startIcon={<ArrowBack />}
            sx={{
                borderRadius: 0, color: 'rgba(237,237,237,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', padding: '8px 20px',
                '&:hover': { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.2)' },
            }}
        >BACK</Button>
    )

    const nextBtn = step < 7 && (
        <Button
            type='button'
            onClick={() => setStep(s => s + 1)}
            disabled={!canAdvance()}
            endIcon={<ArrowForward />}
            variant='contained'
            sx={{
                borderRadius: 0, background: 'var(--red)',
                fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.8rem', padding: '8px 20px',
                '&:hover': { background: 'rgba(219,0,29,0.85)' },
                '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.3)' },
            }}
        >
            CONTINUE
        </Button>
    )

    const nav = (
        <div style={{ display: 'flex', justifyContent: step === 1 ? 'flex-end' : 'space-between', marginTop: 8 }}>
            {backBtn}
            {nextBtn}
            {step === 7 && (
                <Button
                    type='submit'
                    variant='contained'
                    disabled={loading || nameStatus === 'taken' || nameStatus === 'checking'}
                    endIcon={loading ? <CircularProgress size={16} color='inherit' /> : <Send />}
                    sx={{
                        borderRadius: 0, background: 'var(--red)',
                        fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.8rem', padding: '10px 24px',
                        '&:hover': { background: 'rgba(219,0,29,0.85)' },
                        '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                    }}
                >
                    {loading ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}
                </Button>
            )}
        </div>
    )

    const latency = REGION_LATENCY[fields.region] ?? null
    const nameHelperText = nameOffensive ? 'This name contains offensive language.'
        : nameStatus === 'checking'  ? 'Checking availability...'
        : nameStatus === 'available' ? '✓ Name is available'
        : nameStatus === 'taken'     ? 'This name is already in use.'
        : undefined
    const nameColor = nameOffensive ? '#f59e0b' : nameStatus === 'available' ? '#00c364' : nameStatus === 'taken' ? '#db001d' : undefined

    return (
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
            <input type='text' name='website' value={fields.website} onChange={set('website')} style={{ display: 'none' }} tabIndex={-1} autoComplete='off' />

            {progressBar}

            {/* ── Step 1: Discord ── */}
            {step === 1 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 1 — Discord Verification', "Sign in with Discord to verify you've joined the ASOT server before continuing.")}
                    {!discord ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 16px', background: 'rgba(88,101,242,0.04)', border: '1px solid rgba(88,101,242,0.2)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6, textAlign: 'center' }}>
                                You must be a member of the{' '}
                                <a href='https://discord.gg/asot' target='_blank' rel='noreferrer' style={{ color: '#5865f2', textDecoration: 'none', fontWeight: 600 }}>ASOT Discord server</a>
                                {' '}before applying. Click below to verify your membership.
                            </div>
                            {discordError && <div style={{ fontSize: '0.75rem', color: '#ef4444', textAlign: 'center' }}>{discordError}</div>}
                            <a href='/api/applications/discord-login' style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#5865f2', color: '#fff', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textDecoration: 'none' }}>
                                <svg width='16' height='12' viewBox='0 0 71 55' fill='white' xmlns='http://www.w3.org/2000/svg'>
                                    <path d='M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.7 37.7 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.5 4.9a.2.2 0 0 0-.1.1C1.5 18.1-.9 31 .3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-8.9.2.2 0 0 0 .1-.2c1.4-14.8-2.4-27.6-10-39a.2.2 0 0 0-.1 0zM23.7 36c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.1-6.4 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.1-6.4 7.1z'/>
                                </svg>
                                SIGN IN WITH DISCORD
                            </a>
                            {isDev && (
                                <div style={{ width: '100%', borderTop: '1px dashed rgba(255,165,0,0.25)', paddingTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,165,0,0.5)', fontWeight: 700 }}>Dev Mode</span>
                                    <button
                                        type='button'
                                        onClick={async () => {
                                            const res  = await fetch('/api/applications/dev-login')
                                            const data = await res.json()
                                            if (data.ok) setDiscord({ id: data.id, username: data.username, globalName: data.globalName, avatar: data.avatar })
                                            else setDiscordError(data.error ?? 'Dev login failed.')
                                        }}
                                        style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', background: 'rgba(255,165,0,0.08)', border: '1px dashed rgba(255,165,0,0.4)', color: 'rgba(255,165,0,0.8)' }}
                                    >
                                        USE ADMIN SESSION
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {discord.avatar && <img src={discord.avatar} alt='' style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>{discord.globalName}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>@{discord.username}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#00c364', marginLeft: 6 }}>
                                    <CheckCircle style={{ fontSize: 14 }} />
                                    ASOT server verified
                                </div>
                            </div>
                            <button type='button' onClick={async () => { await fetch('/api/applications/discord-session', { method: 'DELETE' }); setDiscord(null) }} style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Sign out
                            </button>
                        </div>
                    )}
                    {nav}
                </div>
            )}

            {/* ── Step 2: Steam ── */}
            {step === 2 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 2 — Steam Account', 'Link your Steam account to verify your ARMA 3 hours. This is required to continue.')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>Steam Profile URL or SteamID64</span>
                            <SteamHelp />
                        </div>
                        {steamAuthError && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{steamAuthError}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <TextField
                                placeholder='https://steamcommunity.com/id/yourprofile'
                                value={fields.steamUrl}
                                onChange={e => setFields(prev => ({ ...prev, steamId64: '', steamUrl: e.target.value }))}
                                fullWidth sx={inputSx}
                                InputProps={{
                                    endAdornment: steamStatus === 'resolving' ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                                        : steamStatus === 'resolved' ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                                        : undefined,
                                }}
                            />
                            <button type='button' onClick={handleSteamSignIn} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                SIGN IN WITH STEAM
                            </button>
                        </div>
                        {steamStatus === 'resolved' && (
                            <div style={{ fontSize: '0.72rem', color: '#00c364', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle style={{ fontSize: 14 }} />
                                SteamID64: <strong style={{ fontFamily: 'monospace' }}>{fields.steamId64}</strong>
                            </div>
                        )}
                        {steamStatus === 'error' && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{steamError}</div>}
                    </div>
                    {isDev && steamStatus !== 'resolved' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px dashed rgba(255,165,0,0.2)' }}>
                            <span style={{ fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,165,0,0.5)', fontWeight: 700, flexShrink: 0 }}>Dev Mode</span>
                            <button
                                type='button'
                                onClick={() => {
                                    setFields(prev => ({ ...prev, steamUrl: 'https://steamcommunity.com/profiles/76561198000000001', steamId64: '76561198000000001' }))
                                    setSteamStatus('resolved')
                                }}
                                style={{ padding: '5px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', background: 'rgba(255,165,0,0.08)', border: '1px dashed rgba(255,165,0,0.4)', color: 'rgba(255,165,0,0.8)' }}
                            >
                                MOCK STEAM
                            </button>
                        </div>
                    )}
                    {nav}
                </div>
            )}

            {/* ── Step 3: Identity ── */}
            {step === 3 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 3 — Identity', "Your in-game name must be unique within the unit — it's how you'll be known in ops.")}
                    <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.6, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        This will be your identity across all ASOT operations and on Discord — choose carefully.
                        Once accepted, your name can only be changed with command approval.
                    </div>
                    <TextField
                        label='In-Game Name' placeholder='e.g. Thomas, Six, Yoshi'
                        value={fields.inGameName} onChange={set('inGameName')}
                        required fullWidth inputProps={{ maxLength: 12 }}
                        helperText={nameHelperText}
                        FormHelperTextProps={{ style: { color: nameColor, fontSize: '0.75rem', marginTop: 4 } }}
                        InputProps={{
                            endAdornment: nameStatus === 'checking' ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                                : nameOffensive             ? <Warning     style={{ fontSize: 16, color: '#f59e0b' }} />
                                : nameStatus === 'available' ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                                : nameStatus === 'taken'     ? <Warning     style={{ fontSize: 16, color: '#db001d' }} />
                                : undefined,
                        }}
                        sx={{
                            ...inputSx,
                            ...(nameOffensive && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(245,158,11,0.6)' } }),
                            ...(nameStatus === 'available' && !nameOffensive && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' } }),
                            ...(nameStatus === 'taken' && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)' } }),
                        }}
                    />
                    {nameSimilar.length > 0 && nameStatus !== 'taken' && (
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', padding: '6px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            Your name is very similar to an existing member: <strong>{nameSimilar.join(', ')}</strong>. Please choose a more distinct name.
                        </div>
                    )}
                    {nav}
                </div>
            )}

            {/* ── Step 4: Background ── */}
            {step === 4 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 4 — Background', "Tell us about yourself — your age, where you're from, and your ARMA 3 experience.")}
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                        <TextField label='Age' placeholder='Your age' type='number' value={fields.age} onChange={set('age')} required inputProps={{ min: 13, max: 100 }} sx={inputSx} />
                        <FormControl required sx={inputSx}>
                            <InputLabel>Region</InputLabel>
                            <Select value={fields.region} label='Region' onChange={e => setSelect('region')(e.target.value)}>
                                {REGIONS.map(r => <MenuItem key={r} value={r} style={{ fontSize: '0.85rem' }}>{r}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            label='ARMA 3 Hours'
                            placeholder='e.g. 500'
                            value={fields.armaHours}
                            onChange={set('armaHours')}
                            onKeyDown={e => {
                                const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', 'Enter']
                                if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) {
                                    e.preventDefault()
                                    setArmaHoursAlert(true)
                                    if (armaHoursTimer.current) clearTimeout(armaHoursTimer.current)
                                    armaHoursTimer.current = setTimeout(() => setArmaHoursAlert(false), 2000)
                                }
                            }}
                            inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                            helperText={armaHoursAlert ? 'Numbers only' : undefined}
                            FormHelperTextProps={{ style: { color: '#f59e0b', fontSize: '0.7rem', marginTop: 3 } }}
                            sx={inputSx}
                        />
                        <FormControl sx={inputSx}>
                            <InputLabel>Own ARMA 3?</InputLabel>
                            <Select value={fields.ownsArma ? 'yes' : 'no'} label='Own ARMA 3?' onChange={e => setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' }))}>
                                <MenuItem value='yes'>Yes</MenuItem>
                                <MenuItem value='no'>No</MenuItem>
                            </Select>
                        </FormControl>
                    </div>
                    {!fields.ownsArma && (
                        <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#f59e0b', lineHeight: 1.6, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <Warning style={{ fontSize: 16, color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                            <span>Be advised - you can continue your application, but you will need to purchase a legal copy of ARMA 3 before you can officially join the unit.</span>
                        </div>
                    )}
                    {latency !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                            <span>Estimated latency to our server:</span>
                            <LatencyBadge ms={latency} />
                        </div>
                    )}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <FormControl sx={inputSx}>
                            <InputLabel>Prior milsim experience?</InputLabel>
                            <Select value={fields.priorMilsim ? 'yes' : 'no'} label='Prior milsim experience?' onChange={e => setFields(prev => ({ ...prev, priorMilsim: e.target.value === 'yes' }))}>
                                <MenuItem value='yes'>Yes</MenuItem>
                                <MenuItem value='no'>No</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl sx={inputSx}>
                            <InputLabel>Part of another ARMA 3 unit?</InputLabel>
                            <Select value={fields.dualClan ? 'yes' : 'no'} label='Part of another ARMA 3 unit?' onChange={e => setFields(prev => ({ ...prev, dualClan: e.target.value === 'yes' }))}>
                                <MenuItem value='yes'>Yes</MenuItem>
                                <MenuItem value='no'>No</MenuItem>
                            </Select>
                        </FormControl>
                    </div>
                    {fields.priorMilsim && (
                        <TextField label='Previous units / groups' placeholder='List any previous milsim units or groups you have been part of' value={fields.previousUnits} onChange={set('previousUnits')} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} sx={inputSx} />
                    )}
                    {fields.dualClan && (
                        <TextField label='Current unit / group' placeholder='List your current group(s)' value={fields.currentUnit} onChange={set('currentUnit')} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} sx={inputSx} />
                    )}
                    {nav}
                </div>
            )}

            {/* ── Step 5: Availability ── */}
            {step === 5 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 5 — Availability', "Let us know when you're free. Consistent attendance is important — our ops run on a fixed schedule.")}
                    <OpTimesDisplay />
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <FormControl required sx={inputSx}>
                            <InputLabel>Available operation nights</InputLabel>
                            <Select value={fields.availableNights} label='Available operation nights' onChange={e => setSelect('availableNights')(e.target.value)}>
                                {NIGHTS.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl required sx={inputSx}>
                            <InputLabel>Operations per month (approx.)</InputLabel>
                            <Select value={fields.opsPerMonth} label='Operations per month (approx.)' onChange={e => setSelect('opsPerMonth')(e.target.value)}>
                                {OPS_PER_MONTH.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </div>
                    {nav}
                </div>
            )}

            {/* ── Step 6: Roles ── */}
            {step === 6 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 6 — Role Interest', "Pick your preferred role. All new members receive onboarding — you'll be trained before being assigned to a section.")}
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
                    {nav}
                </div>
            )}

            {/* ── Step 7: About You ── */}
            {step === 7 && (
                <div className='flex flex-col gap-4'>
                    {sectionLabel('Step 7 — About You', "Give us some context. Why do you want to join ASOT? What's your background in ARMA or milsim? The more detail, the better.")}
                    <TextField
                        label='Prior Military / Gaming Experience'
                        placeholder='Tell us about your Arma experience, military background, other milsim units, etc.'
                        value={fields.experience} onChange={set('experience')}
                        required multiline minRows={4} fullWidth
                        inputProps={{ maxLength: 2000 }}
                        helperText={`${fields.experience.length} / 2000`}
                        sx={inputSx}
                    />
                    {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
                    {nav}
                </div>
            )}
        </form>
    )
}
