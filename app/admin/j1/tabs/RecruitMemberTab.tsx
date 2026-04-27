'use client'

import { useState, useEffect, useRef } from 'react'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Autocomplete, Checkbox, FormControlLabel, FormGroup,
} from '@mui/material'
import { PersonAdd, CheckCircle, Warning, ArrowForward, ArrowBack, HelpOutline } from '@mui/icons-material'
import { Typography } from '@mui/material'
import { containsOffensiveWord } from '@/lib/offensive-words'

const REGIONS = ['Oceania', 'Asia', 'Europe', 'North America', 'South America', 'Middle East', 'Africa', 'Other']
const OCEANIA_ASIA = new Set(['Oceania', 'Asia'])
const NIGHTS = ['Saturday', 'Sunday', 'Both', 'Flexible']
const OPS_PER_MONTH = ['1+', '2+', '3+', '4+']
const PRIMARY_ROLES = [
    'Infantry', 'Combat First Aider (CFA)', 'Advanced Medic',
    'Rotary Aviation', 'Armoured Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]
const DEPARTMENTS = [
    'J1 — Recruitment', 'J2 — Mission Making', 'J3 — Training',
    'J4 — Company Headquarters', 'J5 — Media',
    'J6 — Gamemasters (Zeus)', 'J7 — Community Development',
]
const HEARD_ABOUT_OPTIONS = [
    'Friend / Referral', 'Discord Server', 'Reddit',
    'Social Media', 'YouTube', 'Google / Web Search', 'Other',
]

const STEP_LABELS = ['Discord', 'Steam', 'Identity', 'Background', 'Availability', 'Roles', 'Admin']

interface MemberOption {
    id: string
    displayName: string
    username: string | null
    inGameName: string | null
    discharged: boolean
    isSkeleton: boolean
    isActiveMember: boolean
}

interface RecruitMemberTabProps {
    displayName: string
}

export default function RecruitMemberTab({ displayName }: RecruitMemberTabProps) {
    const [step, setStep] = useState(1)

    const [fields, setFields] = useState({
        discordUsername: '',
        discordId: '',
        joiningName: '',
        recruiter: displayName,
        steamUrl: '',
        steamId64: '',
        region: '',
        regionCustom: '',
        age: '',
        armaHours: '',
        ownsArma: false,
        priorMilsim: false,
        dualClan: false,
        previousUnits: '',
        currentUnit: '',
        availableNights: '',
        opsPerMonth: '',
        primaryRole: '',
        additionalRoles: [] as string[],
        departmentInterest: [] as string[],
        heardAbout: '',
        heardAboutOther: '',
        experience: '',
        notes: '',
    })

    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState<string | null>(null)
    const [success,  setSuccess]  = useState(false)

    // Member picker
    const [memberList,     setMemberList]     = useState<MemberOption[]>([])
    const [membersLoading, setMembersLoading] = useState(true)
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [manualEntry,    setManualEntry]     = useState(false)

    // Returning member status
    const [returningStatus, setReturningStatus] = useState<'active' | 'discharged' | null>(null)
    const [returningName,   setReturningName]   = useState<string | null>(null)

    // Joining name check
    const [nameStatus,    setNameStatus]    = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameSimilar,   setNameSimilar]   = useState<string[]>([])
    const [nameOffensive, setNameOffensive] = useState(false)
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Steam resolution
    const [steamStatus, setSteamStatus] = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError,  setSteamError]  = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/admin/j1/members')
            .then(r => r.json())
            .then(data => setMemberList(data.members ?? []))
            .catch(() => {})
            .finally(() => setMembersLoading(false))
    }, [])

    useEffect(() => {
        if (!selectedMember) { setReturningStatus(null); return }
        if (selectedMember.discharged) {
            setReturningStatus('discharged')
            setReturningName(selectedMember.displayName)
        } else if (selectedMember.isActiveMember) {
            setReturningStatus('active')
            setReturningName(selectedMember.displayName)
        } else {
            setReturningStatus(null)
        }
    }, [selectedMember])

    useEffect(() => {
        const name = fields.joiningName.trim()
        if (!name || name.length < 2) { setNameStatus('idle'); setNameOffensive(false); setNameSimilar([]); return }
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
    }, [fields.joiningName])

    const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields(prev => ({ ...prev, [key]: e.target.value }))

    const toggleArr = (key: 'additionalRoles' | 'departmentInterest', value: string) =>
        setFields(prev => {
            const arr = prev[key] as string[]
            return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
        })

    async function resolveSteam() {
        const url = fields.steamUrl.trim()
        if (!url) return
        setSteamStatus('resolving')
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
    }

    function resetForm() {
        setStep(1)
        setFields({
            discordUsername: '', discordId: '', joiningName: '', recruiter: displayName,
            steamUrl: '', steamId64: '', region: '', regionCustom: '',
            age: '', armaHours: '', ownsArma: false, priorMilsim: false, dualClan: false,
            previousUnits: '', currentUnit: '', availableNights: '', opsPerMonth: '',
            primaryRole: '', additionalRoles: [], departmentInterest: [],
            heardAbout: '', heardAboutOther: '', experience: '', notes: '',
        })
        setSelectedMember(null)
        setManualEntry(false)
        setReturningStatus(null)
        setReturningName(null)
        setSteamStatus('idle')
        setSteamError(null)
        setNameStatus('idle')
        setNameOffensive(false)
        setNameSimilar([])
        setError(null)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (nameStatus === 'taken' || nameOffensive) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/j1/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...fields, isDirectRecruit: true }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Something went wrong.')
            } else {
                setSuccess(true)
                resetForm()
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const canAdvance = (): boolean => {
        switch (step) {
            case 1: return !!fields.discordId.trim()
            case 2: return steamStatus === 'resolved'
            case 3: return !!fields.joiningName.trim() && nameStatus === 'available' && !nameOffensive
            case 4: return !!fields.age && !!fields.region
            case 5: return !!fields.availableNights && !!fields.opsPerMonth
            case 6: return !!fields.primaryRole
            default: return false
        }
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.85rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.85rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
        '& .MuiSelect-select': { fontSize: '0.85rem' },
    }

    const sectionLabel = (text: string, sub?: string) => (
        <div style={{ marginBottom: sub ? 6 : 4 }}>
            <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                {text}
            </Typography>
            {sub && <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5, marginTop: 3 }}>{sub}</div>}
        </div>
    )

    const nameHelperText = nameStatus === 'checking' ? 'Checking...'
        : nameStatus === 'taken'     ? 'This name is already in use'
        : nameStatus === 'available' && !nameOffensive ? '✓ Name is available'
        : undefined
    const nameColor = nameStatus === 'available' && !nameOffensive ? '#00c364' : nameStatus === 'taken' ? '#db001d' : undefined

    // Progress bar
    const progressBar = (
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
            {STEP_LABELS.map((label, i) => {
                const stepNum  = i + 1
                const isDone   = stepNum < step
                const isActive = stepNum === step
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <div style={{ height: 1, flex: 1, marginBottom: 18, background: i === 0 ? 'transparent' : isDone ? 'rgba(0,195,100,0.4)' : 'rgba(255,255,255,0.07)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.6rem', fontWeight: 700,
                                background: isDone ? '#00c364' : isActive ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.05)',
                                border: isDone ? '1px solid #00c364' : isActive ? '1px solid var(--red)' : '1px solid rgba(255,255,255,0.1)',
                                color: isDone ? '#fff' : isActive ? 'var(--red)' : 'rgba(237,237,237,0.25)',
                            }}>
                                {isDone ? '✓' : stepNum}
                            </div>
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.06em',
                                textTransform: 'uppercase', whiteSpace: 'nowrap',
                                color: isDone ? '#00c364' : isActive ? 'rgba(237,237,237,0.7)' : 'rgba(237,237,237,0.2)',
                            }}>
                                {label}
                            </span>
                        </div>
                        <div style={{ height: 1, flex: 1, marginBottom: 18, background: i === STEP_LABELS.length - 1 ? 'transparent' : isDone ? 'rgba(0,195,100,0.4)' : 'rgba(255,255,255,0.07)' }} />
                    </div>
                )
            })}
        </div>
    )

    const nav = (isSubmit = false) => (
        <div style={{ display: 'flex', justifyContent: step === 1 ? 'flex-end' : 'space-between', marginTop: 8 }}>
            {step > 1 && (
                <Button
                    type='button'
                    onClick={() => setStep(s => s - 1)}
                    startIcon={<ArrowBack />}
                    sx={{
                        borderRadius: 0, color: 'rgba(237,237,237,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', padding: '7px 18px',
                        '&:hover': { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.2)' },
                    }}
                >BACK</Button>
            )}
            {!isSubmit ? (
                <Button
                    type='button'
                    onClick={() => setStep(s => s + 1)}
                    disabled={!canAdvance()}
                    endIcon={<ArrowForward />}
                    variant='contained'
                    sx={{
                        borderRadius: 0, background: 'var(--red)',
                        fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.78rem', padding: '7px 18px',
                        '&:hover': { background: 'rgba(219,0,29,0.85)' },
                        '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.3)' },
                    }}
                >CONTINUE</Button>
            ) : (
                <Button
                    type='submit'
                    variant='contained'
                    disabled={loading || nameStatus === 'taken' || nameOffensive}
                    startIcon={loading ? <CircularProgress size={14} color='inherit' /> : <PersonAdd />}
                    sx={{
                        borderRadius: 0, background: 'var(--red)',
                        fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.78rem', padding: '7px 18px',
                        '&:hover': { background: 'rgba(219,0,29,0.85)' },
                        '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.3)' },
                    }}
                >
                    {loading ? 'LOGGING...' : 'LOG RECRUIT'}
                </Button>
            )}
        </div>
    )

    if (success) return (
        <div className='flex flex-col gap-4 p-5 max-w-[680px]'>
            <div
                className='flex items-center gap-3 px-4 py-4'
                style={{ border: '1px solid rgba(0,195,100,0.2)', borderLeft: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}
            >
                <CheckCircle style={{ fontSize: 20, color: '#00c364', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 2 }}>Recruit logged successfully</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>The record is now visible in the Applications tab.</div>
                </div>
            </div>
            <Button
                onClick={() => setSuccess(false)}
                sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 16px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}
            >
                ADD ANOTHER RECRUIT
            </Button>
        </div>
    )

    return (
        <div className='flex flex-col gap-4 p-5 max-w-[680px]'>
            <div>
                <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>
                    Direct Recruitment
                </Typography>
                <Typography style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                    Use this form to log a member who was directly recruited. A record will be created in the Applications Register with &quot;Accepted&quot; status.
                </Typography>
            </div>

            {progressBar}

            <form onSubmit={handleSubmit} className='flex flex-col gap-4'>

                {/* ── Step 1: Discord ── */}
                {step === 1 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 1 — Discord Member', 'Select the recruit from the server list, or enter their details manually.')}

                        {!manualEntry ? (
                            <>
                                <Autocomplete
                                    options={memberList}
                                    loading={membersLoading}
                                    value={selectedMember}
                                    onChange={(_, val) => {
                                        setSelectedMember(val)
                                        setFields(prev => ({
                                            ...prev,
                                            discordUsername: val ? (val.username ?? val.displayName) : '',
                                            discordId: val?.id ?? '',
                                        }))
                                    }}
                                    getOptionLabel={o => o.displayName}
                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                    filterOptions={(options, { inputValue }) => {
                                        const q = inputValue.toLowerCase().trim()
                                        if (!q) return options
                                        return options.filter(o =>
                                            o.displayName.toLowerCase().includes(q) ||
                                            (o.username && o.username.toLowerCase().includes(q)) ||
                                            o.id.includes(q) ||
                                            (o.inGameName && o.inGameName.toLowerCase().includes(q))
                                        )
                                    }}
                                    renderOption={(props, option) => {
                                        const { key, ...liProps } = props
                                        return (
                                            <li key={option.id} {...liProps} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', padding: '6px 12px' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span>{option.displayName}</span>
                                                        {option.username && (
                                                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>@{option.username}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', marginTop: 1 }}>{option.id}</div>
                                                </div>
                                                {option.inGameName && (
                                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>{option.inGameName}</span>
                                                )}
                                                {option.isSkeleton && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 5px', flexShrink: 0 }}>
                                                        CSV
                                                    </span>
                                                )}
                                                {option.discharged && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', flexShrink: 0 }}>
                                                        DISCHARGED
                                                    </span>
                                                )}
                                            </li>
                                        )
                                    }}
                                    renderInput={params => (
                                        <TextField
                                            {...params}
                                            label='Select Discord member'
                                            placeholder='Search by name, @username, or Discord ID...'
                                            required
                                            sx={inputSx}
                                            InputProps={{
                                                ...params.InputProps,
                                                endAdornment: (
                                                    <>
                                                        {membersLoading ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} /> : null}
                                                        {params.InputProps.endAdornment}
                                                    </>
                                                ),
                                            }}
                                        />
                                    )}
                                    sx={{ '& .MuiAutocomplete-paper': { borderRadius: 0, background: '#1a1a1a' }, ...inputSx }}
                                    PaperComponent={({ children, ...props }) => (
                                        <div {...props as React.HTMLAttributes<HTMLDivElement>} style={{ background: '#1a1a1a', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0, marginTop: 2 }}>
                                            {children}
                                        </div>
                                    )}
                                />
                                <button
                                    type='button'
                                    onClick={() => setManualEntry(true)}
                                    style={{ alignSelf: 'flex-start', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                                >
                                    Can&apos;t find them? Enter manually
                                </button>
                            </>
                        ) : (
                            <>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <TextField
                                        label='Discord Username'
                                        placeholder='e.g. username'
                                        value={fields.discordUsername}
                                        onChange={set('discordUsername')}
                                        required fullWidth sx={inputSx}
                                    />
                                    <TextField
                                        label='Discord ID'
                                        placeholder='17–18 digit user ID'
                                        value={fields.discordId}
                                        onChange={set('discordId')}
                                        required fullWidth sx={inputSx}
                                        helperText='Right-click their name in Discord → Copy User ID'
                                        FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                                    />
                                </div>
                                <button
                                    type='button'
                                    onClick={() => {
                                        setManualEntry(false)
                                        setFields(prev => ({ ...prev, discordUsername: '', discordId: '' }))
                                    }}
                                    style={{ alignSelf: 'flex-start', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                                >
                                    ← Back to member list
                                </button>
                            </>
                        )}

                        {returningStatus === 'active' && (
                            <div style={{ padding: '10px 14px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '3px solid #db001d', fontSize: '0.78rem', color: '#ef4444', lineHeight: 1.5 }}>
                                <strong>{returningName}</strong> is already an active member. Are you sure you want to log a new recruit record for them?
                            </div>
                        )}
                        {returningStatus === 'discharged' && (
                            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '3px solid #f59e0b', fontSize: '0.78rem', color: '#f59e0b', lineHeight: 1.5 }}>
                                <strong>{returningName}</strong> is a returning member (previously discharged). Review their record before proceeding.
                            </div>
                        )}

                        {nav()}
                    </div>
                )}

                {/* ── Step 2: Steam (mandatory) ── */}
                {step === 2 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 2 — Steam Account', 'A Steam account is required. Paste their profile URL and click Resolve.')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <TextField
                                    label='Steam Profile URL'
                                    placeholder='https://steamcommunity.com/id/profile'
                                    value={fields.steamUrl}
                                    onChange={e => {
                                        setFields(prev => ({ ...prev, steamUrl: e.target.value, steamId64: '' }))
                                        setSteamStatus('idle')
                                        setSteamError(null)
                                    }}
                                    fullWidth sx={inputSx} required
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
                                    onClick={resolveSteam}
                                    disabled={!fields.steamUrl.trim() || steamStatus === 'resolving'}
                                    style={{
                                        flexShrink: 0, alignSelf: 'stretch',
                                        padding: '0 14px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(219,0,29,0.25)',
                                        color: 'rgba(237,237,237,0.6)',
                                        cursor: 'pointer',
                                        opacity: !fields.steamUrl.trim() ? 0.4 : 1,
                                    }}
                                >
                                    RESOLVE
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
                            {steamStatus !== 'resolved' && (
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1.5 }}>
                                    Find the URL by opening their Steam profile → right-click → Copy Page URL.
                                    Accepts both <code style={{ fontSize: '0.68rem' }}>steamcommunity.com/id/name</code> and <code style={{ fontSize: '0.68rem' }}>/profiles/76561…</code>
                                </div>
                            )}
                        </div>
                        {nav()}
                    </div>
                )}

                {/* ── Step 3: Identity ── */}
                {step === 3 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 3 — Joining Name', "The recruit's in-unit identity. Must be unique — max 12 characters.")}
                        <TextField
                            label='Joining Name'
                            placeholder='e.g. Thomas, Six, Yoshi'
                            value={fields.joiningName}
                            onChange={set('joiningName')}
                            required fullWidth
                            inputProps={{ maxLength: 12 }}
                            helperText={nameOffensive ? 'This name may not be appropriate.' : nameHelperText}
                            FormHelperTextProps={{ style: { color: nameOffensive ? '#f59e0b' : nameColor, fontSize: '0.75rem', marginTop: 4 } }}
                            InputProps={{
                                endAdornment: nameStatus === 'checking'
                                    ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                                    : nameStatus === 'available' && !nameOffensive ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                                    : nameStatus === 'taken' || nameOffensive ? <Warning style={{ fontSize: 16, color: nameOffensive ? '#f59e0b' : '#db001d' }} />
                                    : undefined,
                            }}
                            sx={{
                                ...inputSx,
                                ...(nameStatus === 'available' && !nameOffensive && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' } }),
                                ...(nameStatus === 'taken' && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)' } }),
                            }}
                        />
                        {nameSimilar.length > 0 && nameStatus !== 'taken' && (
                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderLeft: '3px solid #f59e0b', lineHeight: 1.6 }}>
                                Similar name{nameSimilar.length > 1 ? 's' : ''} already in the unit: <strong>{nameSimilar.join(', ')}</strong>. Confirm this is intentional.
                            </div>
                        )}
                        {nav()}
                    </div>
                )}

                {/* ── Step 4: Background ── */}
                {step === 4 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 4 — Background', "The recruit's age, location, and ARMA 3 experience.")}
                        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                            <TextField
                                label='Age'
                                placeholder='e.g. 22'
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
                                    value={fields.region} label='Region'
                                    onChange={e => setFields(prev => ({ ...prev, region: e.target.value, regionCustom: '' }))}
                                >
                                    {REGIONS.map(r => <MenuItem key={r} value={r} style={{ fontSize: '0.85rem' }}>{r}</MenuItem>)}
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
                                <InputLabel>Owns ARMA 3?</InputLabel>
                                <Select
                                    value={fields.ownsArma ? 'yes' : 'no'} label='Owns ARMA 3?'
                                    onChange={e => setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' }))}
                                >
                                    <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                    <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                </Select>
                            </FormControl>
                        </div>

                        {fields.region === 'Other' && (
                            <TextField
                                label='Country / Region'
                                placeholder='Enter their country or region'
                                value={fields.regionCustom}
                                onChange={set('regionCustom')}
                                fullWidth sx={inputSx}
                            />
                        )}
                        {fields.region && !OCEANIA_ASIA.has(fields.region) && fields.region !== 'Other' && (
                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderLeft: '3px solid #f59e0b', lineHeight: 1.5 }}>
                                <HelpOutline style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 5 }} />
                                Members outside Oceania/Asia may experience higher latency and timezone differences during ops. Confirm they understand the schedule.
                            </div>
                        )}

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <FormControl sx={inputSx}>
                                <InputLabel>Prior milsim experience?</InputLabel>
                                <Select
                                    value={fields.priorMilsim ? 'yes' : 'no'} label='Prior milsim experience?'
                                    onChange={e => setFields(prev => ({ ...prev, priorMilsim: e.target.value === 'yes' }))}
                                >
                                    <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                    <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl sx={inputSx}>
                                <InputLabel>Part of another ARMA 3 unit?</InputLabel>
                                <Select
                                    value={fields.dualClan ? 'yes' : 'no'} label='Part of another ARMA 3 unit?'
                                    onChange={e => setFields(prev => ({ ...prev, dualClan: e.target.value === 'yes' }))}
                                >
                                    <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                    <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                </Select>
                            </FormControl>
                        </div>
                        {fields.priorMilsim && (
                            <TextField
                                label='Previous units / groups'
                                placeholder='List any previous milsim units or groups'
                                value={fields.previousUnits}
                                onChange={set('previousUnits')}
                                fullWidth multiline minRows={2}
                                inputProps={{ maxLength: 500 }}
                                sx={inputSx}
                            />
                        )}
                        {fields.dualClan && (
                            <TextField
                                label='Current unit / group'
                                placeholder='List their current group(s)'
                                value={fields.currentUnit}
                                onChange={set('currentUnit')}
                                fullWidth multiline minRows={2}
                                inputProps={{ maxLength: 500 }}
                                sx={inputSx}
                            />
                        )}
                        {nav()}
                    </div>
                )}

                {/* ── Step 5: Availability ── */}
                {step === 5 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 5 — Availability', 'Ops run Saturday and Sunday nights. Platoon 1 on Saturdays, Platoon 2 on Sundays.')}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <FormControl required sx={inputSx}>
                                <InputLabel>Available operation nights</InputLabel>
                                <Select
                                    value={fields.availableNights} label='Available operation nights'
                                    onChange={e => setFields(prev => ({ ...prev, availableNights: e.target.value }))}
                                >
                                    {NIGHTS.map(n => <MenuItem key={n} value={n} style={{ fontSize: '0.85rem' }}>{n}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl required sx={inputSx}>
                                <InputLabel>Operations per month (approx.)</InputLabel>
                                <Select
                                    value={fields.opsPerMonth} label='Operations per month (approx.)'
                                    onChange={e => setFields(prev => ({ ...prev, opsPerMonth: e.target.value }))}
                                >
                                    {OPS_PER_MONTH.map(o => <MenuItem key={o} value={o} style={{ fontSize: '0.85rem' }}>{o}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </div>
                        {nav()}
                    </div>
                )}

                {/* ── Step 6: Roles ── */}
                {step === 6 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 6 — Role Interest', "The recruit's preferred role and any department interest.")}
                        <FormControl required sx={inputSx}>
                            <InputLabel>Primary role</InputLabel>
                            <Select
                                value={fields.primaryRole} label='Primary role'
                                onChange={e => setFields(prev => ({ ...prev, primaryRole: e.target.value }))}
                            >
                                {PRIMARY_ROLES.map(r => <MenuItem key={r} value={r} style={{ fontSize: '0.85rem' }}>{r}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Additional role interests (optional)</div>
                            <FormGroup row sx={{ gap: 0 }}>
                                {PRIMARY_ROLES.map(r => (
                                    <FormControlLabel key={r}
                                        control={<Checkbox size='small' checked={fields.additionalRoles.includes(r)} onChange={() => toggleArr('additionalRoles', r)} sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }} />}
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
                                    <FormControlLabel key={d}
                                        control={<Checkbox size='small' checked={fields.departmentInterest.includes(d)} onChange={() => toggleArr('departmentInterest', d)} sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: 'var(--red)' }, padding: '4px 6px' }} />}
                                        label={<span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)' }}>{d}</span>}
                                        sx={{ marginRight: 2, marginBottom: 0.5 }}
                                    />
                                ))}
                            </FormGroup>
                        </div>
                        {nav()}
                    </div>
                )}

                {/* ── Step 7: Admin ── */}
                {step === 7 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 7 — Admin & Submit', 'Final details before logging this recruit.')}

                        <FormControl sx={inputSx}>
                            <InputLabel>How did they find ASOT?</InputLabel>
                            <Select
                                value={fields.heardAbout} label='How did they find ASOT?'
                                onChange={e => setFields(prev => ({ ...prev, heardAbout: e.target.value, heardAboutOther: '' }))}
                            >
                                {HEARD_ABOUT_OPTIONS.map(o => <MenuItem key={o} value={o} style={{ fontSize: '0.85rem' }}>{o}</MenuItem>)}
                            </Select>
                        </FormControl>
                        {fields.heardAbout === 'Other' && (
                            <TextField
                                label='Please specify'
                                value={fields.heardAboutOther}
                                onChange={set('heardAboutOther')}
                                fullWidth sx={inputSx}
                            />
                        )}

                        <TextField
                            label='Experience / About the Recruit'
                            placeholder='Prior military or gaming background, reason for joining, anything relevant...'
                            value={fields.experience}
                            onChange={set('experience')}
                            multiline minRows={3} fullWidth
                            inputProps={{ maxLength: 2000 }}
                            helperText={fields.experience ? `${fields.experience.length} / 2000` : undefined}
                            FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                            sx={inputSx}
                        />

                        <TextField
                            label='Recruited By'
                            value={fields.recruiter}
                            onChange={set('recruiter')}
                            required fullWidth sx={inputSx}
                        />

                        <TextField
                            label='Notes (optional)'
                            placeholder='Any additional notes about this recruit...'
                            value={fields.notes}
                            onChange={set('notes')}
                            multiline minRows={2} fullWidth
                            inputProps={{ maxLength: 1000 }}
                            sx={inputSx}
                        />

                        {error && (
                            <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>
                        )}

                        {nav(true)}
                    </div>
                )}
            </form>
        </div>
    )
}
