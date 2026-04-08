'use client'

import { useState, useEffect, useRef } from 'react'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Autocomplete,
} from '@mui/material'
import { PersonAdd, CheckCircle, Warning, HelpOutline } from '@mui/icons-material'
import { Typography } from '@mui/material'

const REGIONS = ['Oceania', 'Asia', 'Europe', 'North America', 'South America', 'Middle East', 'Africa', 'Other']
const OCEANIA_ASIA = new Set(['Oceania', 'Asia'])
const NIGHTS = ['Saturday', 'Sunday', 'Both', 'Flexible']
const PRIMARY_ROLES = [
    'Infantry', 'Section Medic', 'Advanced Medic',
    'Rotary Aviation', 'Fixed Wing Aviation', 'Armored Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]
const HEARD_ABOUT_OPTIONS = [
    'Friend / Referral', 'Discord Server', 'Reddit',
    'Social Media', 'YouTube', 'Google / Web Search', 'Other',
]
const OFFENSIVE_WORDS = ['nigger', 'faggot', 'retard', 'chink', 'kike', 'spic', 'cunt', 'coon']

interface MemberOption {
    id: string
    displayName: string
    username: string | null
    inGameName: string | null
    discharged: boolean
}

interface RecruitMemberTabProps {
    displayName: string
}

export default function RecruitMemberTab({ displayName }: RecruitMemberTabProps) {
    const [fields, setFields] = useState({
        discordUsername: '',
        discordId: '',
        joiningName: '',
        recruiter: displayName,
        steamUrl: '',
        steamId64: '',
        region: '',
        regionCustom: '',
        armaHours: '',
        availableNights: '',
        primaryRole: '',
        heardAbout: '',
        heardAboutOther: '',
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
    const [returningStatus, setReturningStatus] = useState<'new' | 'active' | 'discharged' | null>(null)
    const [returningName,   setReturningName]   = useState<string | null>(null)

    // Joining name check
    const [nameStatus,    setNameStatus]    = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameSimilar,   setNameSimilar]   = useState<string[]>([])
    const [nameOffensive, setNameOffensive] = useState(false)
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Steam resolution
    const [steamStatus, setSteamStatus] = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError,  setSteamError]  = useState<string | null>(null)

    // Load member list on mount
    useEffect(() => {
        fetch('/api/admin/j1/members')
            .then(r => r.json())
            .then(data => setMemberList(data.members ?? []))
            .catch(() => {})
            .finally(() => setMembersLoading(false))
    }, [])

    // Auto-detect returning status when a known member is selected
    useEffect(() => {
        if (!selectedMember) { setReturningStatus(null); return }
        setReturningStatus(selectedMember.discharged ? 'discharged' : 'active')
        setReturningName(selectedMember.displayName)
    }, [selectedMember])

    // Joining name check
    useEffect(() => {
        const name = fields.joiningName.trim()
        if (!name || name.length < 2) { setNameStatus('idle'); setNameOffensive(false); setNameSimilar([]); return }

        const lower = name.toLowerCase()
        setNameOffensive(OFFENSIVE_WORDS.some(w => lower.includes(w)))

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
        setFields({
            discordUsername: '', discordId: '', joiningName: '', recruiter: displayName,
            steamUrl: '', steamId64: '', region: '', regionCustom: '',
            armaHours: '', availableNights: '', primaryRole: '',
            heardAbout: '', heardAboutOther: '', notes: '',
        })
        setSelectedMember(null)
        setManualEntry(false)
        setReturningStatus(null)
        setReturningName(null)
        setSteamStatus('idle')
        setSteamError(null)
        setNameStatus('idle')
        setNameOffensive(false)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (nameStatus === 'taken') return
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

    const sectionLabel = (text: string) => (
        <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginTop: 4, marginBottom: 2 }}>
            {text}
        </Typography>
    )

    const nameHelperText = nameStatus === 'checking' ? 'Checking...'
        : nameStatus === 'taken'     ? 'This name is already in use'
        : nameStatus === 'available' && !nameOffensive ? '✓ Name is available'
        : undefined
    const nameColor = nameStatus === 'available' && !nameOffensive ? '#00c364' : nameStatus === 'taken' ? '#db001d' : undefined

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

            {success && (
                <div
                    className='flex items-center gap-3 px-4 py-3'
                    style={{ border: '1px solid rgba(0,195,100,0.2)', borderLeft: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}
                >
                    <CheckCircle style={{ fontSize: 18, color: '#00c364', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)' }}>
                        Recruit logged successfully. The record is now visible in the Applications tab.
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit} className='flex flex-col gap-4'>

                {/* ── Discord Member ── */}
                {sectionLabel('Discord Member')}

                {!manualEntry ? (
                    <>
                        <Autocomplete
                            options={memberList}
                            loading={membersLoading}
                            value={selectedMember}
                            onChange={(_, val) => {
                                setSelectedMember(val)
                                if (val) {
                                    setFields(prev => ({
                                        ...prev,
                                        discordUsername: val.username ?? val.displayName,
                                        discordId: val.id,
                                    }))
                                } else {
                                    setFields(prev => ({ ...prev, discordUsername: '', discordId: '' }))
                                }
                            }}
                            getOptionLabel={o => o.displayName}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            renderOption={(props, option) => (
                                <li {...props} key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', padding: '6px 12px' }}>
                                    <span style={{ flex: 1 }}>{option.displayName}</span>
                                    {option.inGameName && (
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>{option.inGameName}</span>
                                    )}
                                    {option.discharged && (
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px' }}>
                                            DISCHARGED
                                        </span>
                                    )}
                                </li>
                            )}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label='Select Discord member'
                                    placeholder='Search by display name...'
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
                            sx={{
                                '& .MuiAutocomplete-paper': { borderRadius: 0, background: '#1a1a1a' },
                                ...inputSx,
                            }}
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
                            onClick={() => { setManualEntry(false); setFields(prev => ({ ...prev, discordUsername: '', discordId: '' })) }}
                            style={{ alignSelf: 'flex-start', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                            ← Back to member list
                        </button>
                    </>
                )}

                {/* Returning member banner */}
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

                {/* ── Joining Name ── */}
                {sectionLabel('Joining Name')}
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
                        Similar name{nameSimilar.length > 1 ? 's' : ''} already in the unit:{' '}
                        <strong>{nameSimilar.join(', ')}</strong>. Confirm this is intentional.
                    </div>
                )}

                {/* ── Steam ── */}
                {sectionLabel('Steam')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <TextField
                            placeholder='https://steamcommunity.com/id/yourprofile'
                            value={fields.steamUrl}
                            onChange={e => {
                                set('steamUrl')(e)
                                setSteamStatus('idle')
                                setSteamError(null)
                                setFields(prev => ({ ...prev, steamId64: '', steamUrl: e.target.value }))
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
                </div>

                {/* ── Background ── */}
                {sectionLabel('Background')}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <FormControl required sx={inputSx}>
                        <InputLabel>Region</InputLabel>
                        <Select
                            value={fields.region} label='Region'
                            onChange={e => setFields(prev => ({ ...prev, region: e.target.value, regionCustom: '' }))}
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
                        <InputLabel>Available nights</InputLabel>
                        <Select
                            value={fields.availableNights} label='Available nights'
                            onChange={e => setFields(prev => ({ ...prev, availableNights: e.target.value }))}
                        >
                            {NIGHTS.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
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

                <FormControl sx={inputSx}>
                    <InputLabel>Primary role</InputLabel>
                    <Select
                        value={fields.primaryRole} label='Primary role'
                        onChange={e => setFields(prev => ({ ...prev, primaryRole: e.target.value }))}
                    >
                        {PRIMARY_ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </Select>
                </FormControl>

                {/* ── How They Heard ── */}
                {sectionLabel('How They Heard About Us')}
                <FormControl sx={inputSx}>
                    <InputLabel>How did they find ASOT?</InputLabel>
                    <Select
                        value={fields.heardAbout} label='How did they find ASOT?'
                        onChange={e => setFields(prev => ({ ...prev, heardAbout: e.target.value, heardAboutOther: '' }))}
                    >
                        {HEARD_ABOUT_OPTIONS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
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

                {/* ── Admin ── */}
                {sectionLabel('Admin')}
                <TextField
                    label='Recruited By'
                    value={fields.recruiter}
                    onChange={set('recruiter')}
                    required fullWidth sx={inputSx}
                />
                <TextField
                    label='Notes (optional)'
                    placeholder='Any relevant notes about this recruit...'
                    value={fields.notes}
                    onChange={set('notes')}
                    multiline minRows={3} fullWidth
                    inputProps={{ maxLength: 1000 }}
                    sx={inputSx}
                />

                {error && (
                    <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>
                )}

                <Button
                    type='submit'
                    variant='contained'
                    disabled={loading || nameStatus === 'taken'}
                    startIcon={loading ? <CircularProgress size={14} color='inherit' /> : <PersonAdd />}
                    sx={{
                        borderRadius: 0,
                        background: 'var(--red)',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        fontSize: '0.78rem',
                        padding: '9px 20px',
                        alignSelf: 'flex-start',
                        '&:hover': { background: 'rgba(219,0,29,0.85)' },
                        '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                    }}
                >
                    {loading ? 'LOGGING...' : 'LOG RECRUIT'}
                </Button>
            </form>
        </div>
    )
}
