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

// Extended option used in the grouped dropdown
interface CombinedOption extends MemberOption {
    optionGroup: 'Applicants' | 'Current Members'
    isTestApplicant?: boolean
    hasJoinData?: boolean
    applicationData?: {
        discordUsername?: string; discordId?: string
        joiningName?: string; steamUrl?: string; steamId64?: string
        age?: string; region?: string; armaHours?: string
        ownsArma?: boolean; priorMilsim?: boolean; dualClan?: boolean
        previousUnits?: string; currentUnit?: string
        availableNights?: string; opsPerMonth?: string
        primaryRole?: string; additionalRoles?: string[]; departmentInterest?: string[]
        experience?: string; heardAbout?: string; heardAboutOther?: string
    }
}

const TEST_APPLICANTS: CombinedOption[] = [
    {
        id: 'test-app-1',
        displayName: 'TestApp1',
        username: 'testapp1',
        inGameName: 'TestApp1',
        discharged: false,
        isSkeleton: false,
        isActiveMember: false,
        optionGroup: 'Applicants',
        isTestApplicant: true,
        hasJoinData: true,
        applicationData: {
            discordUsername: 'testapp1',
            discordId: '100000000000000001',
            joiningName: 'TestApp1',
            steamUrl: 'https://steamcommunity.com/id/testapp1',
            steamId64: '76561198000000001',
            age: '22',
            region: 'Oceania',
            armaHours: '500',
            ownsArma: true,
            priorMilsim: true,
            dualClan: false,
            previousUnits: 'Test Milsim Unit',
            currentUnit: '',
            availableNights: 'Both',
            opsPerMonth: '3+',
            primaryRole: 'Infantry',
            additionalRoles: ['Combat First Aider (CFA)'],
            departmentInterest: ['J3 — Training'],
            experience: 'Development test applicant — simulates a completed website join application. Full join application data pre-filled.',
            heardAbout: 'Friend / Referral',
        },
    },
    {
        id: 'test-app-2',
        displayName: 'Test Applicant 2 - No Join',
        username: 'testapp2',
        inGameName: null,
        discharged: false,
        isSkeleton: false,
        isActiveMember: false,
        optionGroup: 'Applicants',
        isTestApplicant: true,
        hasJoinData: false,
        applicationData: {
            discordUsername: 'testapp2',
            discordId: '100000000000000002',
        },
    },
]

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
        ownsArma: true,
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
        ageExemptionNote: '',
    })

    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState<string | null>(null)
    const [success,  setSuccess]  = useState(false)

    const isDev = process.env.NODE_ENV === 'development'

    // Member + applicant picker
    const [memberList,        setMemberList]        = useState<CombinedOption[]>([])
    const [applicantList,     setApplicantList]     = useState<CombinedOption[]>([])
    const [membersLoading,    setMembersLoading]    = useState(true)
    const [selectedMember,    setSelectedMember]    = useState<CombinedOption | null>(null)
    const [pendingSelection,  setPendingSelection]  = useState<CombinedOption | null>(null)
    const [changeConfirmOpen, setChangeConfirmOpen] = useState(false)
    const [manualEntry,       setManualEntry]        = useState(false)

    // Returning member status
    const [returningStatus, setReturningStatus] = useState<'active' | 'discharged' | null>(null)
    const [returningName,   setReturningName]   = useState<string | null>(null)

    // Joining name check
    const [nameStatus,    setNameStatus]    = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameSimilar,   setNameSimilar]   = useState<string[]>([])
    const [nameOffensive, setNameOffensive] = useState(false)
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [armaHoursAlert, setArmaHoursAlert] = useState(false)
    const armaHoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [ownsArmaTouched, setOwnsArmaTouched] = useState(false)

    // Steam resolution
    const [steamStatus, setSteamStatus] = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError,  setSteamError]  = useState<string | null>(null)

    useEffect(() => {
        // Fetch Discord members (Current Members group)
        fetch('/api/admin/j1/members')
            .then(r => r.json())
            .then(data => {
                const members: CombinedOption[] = (data.members ?? []).map((m: MemberOption) => ({
                    ...m,
                    optionGroup: 'Current Members' as const,
                }))
                setMemberList(members)
            })
            .catch(() => {})
            .finally(() => setMembersLoading(false))

        // Fetch pending/reviewing/returned applications (Applicants group)
        fetch('/api/admin/j1/applications')
            .then(r => r.json())
            .then(data => {
                const apps: J1Application[] = Array.isArray(data) ? data : (data.applications ?? [])
                const activeApps = apps.filter(a =>
                    ['pending', 'reviewing', 'returned'].includes(a.status as string)
                )
                const appOptions: CombinedOption[] = activeApps.map(a => ({
                    id: a.discordId || String((a as unknown as { _id?: unknown })._id ?? '') || a.discordUsername,
                    displayName: a.discordName || a.discordUsername,
                    username: a.discordUsername,
                    inGameName: a.inGameName || null,
                    discharged: false,
                    isSkeleton: false,
                    isActiveMember: false,
                    optionGroup: 'Applicants' as const,
                    isTestApplicant: false,
                    hasJoinData: !a.isDirectRecruit && !!a.steamId64,
                    applicationData: {
                        discordUsername: a.discordUsername,
                        discordId: a.discordId || '',
                        joiningName: a.inGameName || '',
                        steamUrl: a.steamUrl || '',
                        steamId64: a.steamId64 || '',
                        age: a.age != null ? String(a.age) : '',
                        region: a.region || '',
                        armaHours: a.armaHours != null ? String(a.armaHours) : '',
                        ownsArma: a.ownsArma ?? true,
                        priorMilsim: a.priorMilsim ?? false,
                        dualClan: a.dualClan ?? false,
                        previousUnits: a.previousUnits || '',
                        currentUnit: a.currentUnit || '',
                        availableNights: a.availableNights || '',
                        opsPerMonth: a.opsPerMonth || '',
                        primaryRole: a.primaryRole || '',
                        additionalRoles: a.additionalRoles || [],
                        departmentInterest: a.departmentInterest || [],
                        experience: a.experience || '',
                        heardAbout: a.heardAbout || '',
                        heardAboutOther: a.heardAboutOther || '',
                    },
                }))
                setApplicantList(appOptions)
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        if (!selectedMember || selectedMember.optionGroup === 'Applicants') {
            setReturningStatus(null)
            return
        }
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
            age: '', armaHours: '', ownsArma: true, priorMilsim: false, dualClan: false,
            previousUnits: '', currentUnit: '', availableNights: '', opsPerMonth: '',
            primaryRole: '', additionalRoles: [], departmentInterest: [],
            heardAbout: '', heardAboutOther: '', experience: '', notes: '', ageExemptionNote: '',
        })
        setSelectedMember(null)
        setManualEntry(false)
        setSteamStatus('idle')
        setSteamError(null)
        setReturningStatus(null)
        setReturningName(null)
        setNameStatus('idle')
        setNameOffensive(false)
        setNameSimilar([])
        setArmaHoursAlert(false)
        setOwnsArmaTouched(false)
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

    // Returns true if the user has entered data beyond step 1 (steam / name / background etc.)
    function hasUnsavedProgress(): boolean {
        return step > 1 ||
            steamStatus === 'resolved' ||
            !!fields.joiningName.trim() ||
            !!fields.age ||
            !!fields.region ||
            !!fields.primaryRole
    }

    // Apply a new selection: reset all step state then pre-fill from the new applicant
    function applySelection(val: CombinedOption | null) {
        const defaultFields = {
            discordUsername: '', discordId: '', joiningName: '', recruiter: displayName,
            steamUrl: '', steamId64: '', region: '', regionCustom: '',
            age: '', armaHours: '', ownsArma: true, priorMilsim: false, dualClan: false,
            previousUnits: '', currentUnit: '', availableNights: '', opsPerMonth: '',
            primaryRole: '', additionalRoles: [] as string[], departmentInterest: [] as string[],
            heardAbout: '', heardAboutOther: '', experience: '', notes: '', ageExemptionNote: '',
        }
        setSteamStatus('idle')
        setSteamError(null)
        setNameStatus('idle')
        setNameOffensive(false)
        setNameSimilar([])
        setArmaHoursAlert(false)
        setOwnsArmaTouched(false)
        setReturningStatus(null)
        setReturningName(null)
        setStep(1)
        setSelectedMember(val)

        if (!val) {
            setFields(defaultFields)
            return
        }
        if (val.optionGroup === 'Applicants' && val.applicationData) {
            const a = val.applicationData
            setFields({
                ...defaultFields,
                discordUsername: a.discordUsername || val.username || val.displayName,
                discordId: a.discordId || val.id,
                ...(val.hasJoinData ? {
                    joiningName: a.joiningName || '',
                    steamUrl: a.steamUrl || '',
                    steamId64: a.steamId64 || '',
                    age: a.age || '',
                    region: a.region || '',
                    armaHours: a.armaHours || '',
                    ownsArma: a.ownsArma ?? true,
                    priorMilsim: a.priorMilsim ?? false,
                    dualClan: a.dualClan ?? false,
                    previousUnits: a.previousUnits || '',
                    currentUnit: a.currentUnit || '',
                    availableNights: a.availableNights || '',
                    opsPerMonth: a.opsPerMonth || '',
                    primaryRole: a.primaryRole || '',
                    additionalRoles: a.additionalRoles || [],
                    departmentInterest: a.departmentInterest || [],
                    experience: a.experience || '',
                    heardAbout: a.heardAbout || '',
                    heardAboutOther: a.heardAboutOther || '',
                } : {}),
            })
            if (val.hasJoinData && a.steamId64) {
                setSteamStatus('resolved')
            }
        } else {
            setFields({
                ...defaultFields,
                discordUsername: val.username ?? val.displayName,
                discordId: val.id,
            })
        }
    }

    function isStepComplete(s: number): boolean {
        switch (s) {
            case 1: return !!fields.discordId.trim()
            case 2: return steamStatus === 'resolved'
            case 3: return !!fields.joiningName.trim() && nameStatus === 'available' && !nameOffensive
            case 4: {
                if (!fields.age || !fields.region) return false
                if (Number(fields.age) < 17 && !fields.ageExemptionNote.trim()) return false
                return true
            }
            case 5: return !!fields.availableNights && !!fields.opsPerMonth
            case 6: return !!fields.primaryRole
            default: return true
        }
    }

    const canAdvance = (): boolean => isStepComplete(step)

    function canNavigateTo(targetStep: number): boolean {
        if (targetStep <= step) return true
        for (let s = 1; s < targetStep; s++) {
            if (!isStepComplete(s)) return false
        }
        return true
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

    // Vertical step nav (used inside split-screen layout)
    const verticalStepNav = (
        <div style={{ width: 158, flexShrink: 0, borderRight: '1px solid rgba(219,0,29,0.12)', paddingTop: 8, paddingBottom: 16 }}>
            {STEP_LABELS.map((label, i) => {
                const stepNum   = i + 1
                const isDone    = stepNum < step && isStepComplete(stepNum)
                const isActive  = stepNum === step
                const reachable = canNavigateTo(stepNum)
                const clickable = !isActive && reachable
                return (
                    <div
                        key={label}
                        onClick={clickable ? () => setStep(stepNum) : undefined}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 14px',
                            cursor: clickable ? 'pointer' : 'default',
                            background: isActive ? 'rgba(219,0,29,0.07)' : 'transparent',
                            borderLeft: `2px solid ${isActive ? 'var(--red)' : isDone ? 'rgba(0,195,100,0.5)' : 'transparent'}`,
                            opacity: !reachable && !isActive ? 0.38 : 1,
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = isActive ? 'rgba(219,0,29,0.07)' : 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: 700,
                            background: isDone ? '#00c364' : isActive ? 'rgba(219,0,29,0.18)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isDone ? '#00c364' : isActive ? 'var(--red)' : 'rgba(255,255,255,0.1)'}`,
                            color: isDone ? '#fff' : isActive ? 'var(--red)' : 'rgba(237,237,237,0.25)',
                        }}>
                            {isDone ? '✓' : stepNum}
                        </div>
                        <span style={{
                            fontSize: '0.62rem', fontWeight: isActive ? 700 : 400,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: isActive ? 'rgba(237,237,237,0.9)' : isDone ? '#00c364' : 'rgba(237,237,237,0.35)',
                            lineHeight: 1.2,
                        }}>
                            {label}
                        </span>
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

    // ── Document panel placeholder content ────────────────────────────────────
    const DocSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 8, fontFamily: 'monospace' }}>
                {'// ' + title.toUpperCase()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.7 }}>{children}</div>
        </div>
    )

    if (success) return (
        <div style={{ padding: '20px 24px', maxWidth: 560 }} className='flex flex-col gap-4'>
            <div className='flex items-center gap-3 px-4 py-4' style={{ border: '1px solid rgba(0,195,100,0.2)', borderLeft: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}>
                <CheckCircle style={{ fontSize: 20, color: '#00c364', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 2 }}>Recruit logged — pending J1 lead approval</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>The record is in the Applications tab and awaits sign-off from a J1 lead.</div>
                </div>
            </div>
            <Button onClick={() => setSuccess(false)} sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 16px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}>
                ADD ANOTHER RECRUIT
            </Button>
        </div>
    )

    return (
        // ── Split-screen layout: LEFT (form) + RIGHT (document panel) ─────────────
        <div className='flex flex-col xl:flex-row' style={{ minHeight: 0 }}>

            {/* Change-applicant confirmation modal */}
            {changeConfirmOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1300,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#0f0f0f',
                        border: '1px solid rgba(219,0,29,0.4)',
                        borderTop: '2px solid var(--red)',
                        padding: '24px 28px',
                        maxWidth: 420,
                        width: '90%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                            {'// CONFIRM'}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(237,237,237,0.9)', textTransform: 'uppercase' }}>
                            Change Applicant?
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                            You have unsaved changes. Changing applicant will clear the current form data.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button
                                onClick={() => { setChangeConfirmOpen(false); setPendingSelection(null) }}
                                style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.5)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em' }}
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={() => {
                                    setChangeConfirmOpen(false)
                                    applySelection(pendingSelection)
                                    setPendingSelection(null)
                                }}
                                style={{ background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em' }}
                            >
                                CHANGE APPLICANT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LEFT COLUMN: step nav + form ─────────────────────────────────── */}
            <div className='xl:w-[60%]' style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(219,0,29,0.15)', minWidth: 0 }}>

                {/* Header */}
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 4, fontFamily: 'monospace' }}>
                        J1 — DIRECT RECRUITMENT
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                        Complete all steps to log a recruit. Data is preserved when navigating between steps.
                    </div>
                </div>

                {/* Vertical step nav + form content */}
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {verticalStepNav}

                    {/* Form content */}
                    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
                        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>

                {/* ── Step 1: Discord ── */}
                {step === 1 && (
                    <div className='flex flex-col gap-4'>
                        {sectionLabel('Step 1 — Discord Member', 'Select the recruit from the server list, or enter their details manually.')}

                        {!manualEntry ? (
                            <>
                                <Autocomplete
                                    options={[
                                        // Test applicants (dev only) + real applicants + members
                                        ...(isDev ? TEST_APPLICANTS : TEST_APPLICANTS.map(t => ({ ...t, isTestApplicant: true }))),
                                        ...applicantList,
                                        ...memberList,
                                    ]}
                                    loading={membersLoading}
                                    value={selectedMember}
                                    groupBy={o => o.optionGroup}
                                    onChange={(_, val) => {
                                        // If meaningful progress exists, prompt before discarding
                                        if (hasUnsavedProgress() && val?.id !== selectedMember?.id) {
                                            setPendingSelection(val)
                                            setChangeConfirmOpen(true)
                                            return
                                        }
                                        applySelection(val)
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
                                    renderGroup={params => (
                                        <div key={params.key}>
                                            <div style={{
                                                padding: '6px 12px 4px',
                                                fontSize: '0.55rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.18em',
                                                textTransform: 'uppercase',
                                                color: params.group === 'Applicants' ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)',
                                                background: params.group === 'Applicants' ? 'rgba(219,0,29,0.04)' : 'rgba(255,255,255,0.02)',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                fontFamily: 'monospace',
                                            }}>
                                                {params.group === 'Applicants' ? '// APPLICANTS' : '// CURRENT MEMBERS'}
                                            </div>
                                            {params.children}
                                        </div>
                                    )}
                                    renderOption={(props, option) => {
                                        const { key, ...liProps } = props
                                        return (
                                            <li key={option.id} {...liProps} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', padding: '6px 12px' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <span>{option.displayName}</span>
                                                        {option.username && (
                                                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>@{option.username}</span>
                                                        )}
                                                        {option.isTestApplicant && (
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', flexShrink: 0 }}>
                                                                TEST
                                                            </span>
                                                        )}
                                                        {option.optionGroup === 'Applicants' && !option.isTestApplicant && (
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.7)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', padding: '1px 5px', flexShrink: 0 }}>
                                                                APPLICANT
                                                            </span>
                                                        )}
                                                        {option.hasJoinData && (
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#00c364', background: 'rgba(0,195,100,0.08)', border: '1px solid rgba(0,195,100,0.3)', padding: '1px 5px', flexShrink: 0 }}>
                                                                JOIN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', marginTop: 1 }}>{option.id}</div>
                                                </div>
                                                {option.inGameName && (
                                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>{option.inGameName}</span>
                                                )}
                                                {option.isSkeleton && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 5px', flexShrink: 0 }}>CSV</span>
                                                )}
                                                {option.discharged && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', flexShrink: 0 }}>DISCHARGED</span>
                                                )}
                                            </li>
                                        )
                                    }}
                                    renderInput={params => (
                                        <TextField
                                            {...params}
                                            label='Select applicant or Discord member'
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
                                {selectedMember?.optionGroup === 'Applicants' && selectedMember.hasJoinData && (
                                    <div style={{ fontSize: '0.72rem', color: '#00c364', padding: '8px 12px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <CheckCircle style={{ fontSize: 14, flexShrink: 0 }} />
                                        Application data pre-filled — review each step and confirm details with the applicant.
                                    </div>
                                )}
                                {selectedMember?.optionGroup === 'Applicants' && !selectedMember.hasJoinData && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        No join application — enter all details manually through each step.
                                    </div>
                                )}
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
                                <InputLabel>Owns ARMA 3?</InputLabel>
                                <Select
                                    value={fields.ownsArma ? 'yes' : 'no'} label='Owns ARMA 3?'
                                    onChange={e => {
                                        setOwnsArmaTouched(true)
                                        setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' }))
                                    }}
                                >
                                    <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                    <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                </Select>
                            </FormControl>
                        </div>

                        {ownsArmaTouched && !fields.ownsArma && (
                            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', fontSize: '0.78rem', color: '#f59e0b', lineHeight: 1.6 }}>
                                <Warning style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />
                                The applicant will need to purchase ARMA 3 before officially joining. You may continue with the application — this will be flagged for the J1 lead.
                            </div>
                        )}

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

                        {Number(fields.age) > 0 && Number(fields.age) < 17 && (
                            <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <Warning style={{ fontSize: 16, color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: 3 }}>
                                            Applicant is under 17 — age restriction applies
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                                            To proceed, confirm that this applicant is vouched for by a current member, or that you are requesting an exemption to the age restriction. Name the vouching member or state the reason for the exemption below.
                                        </div>
                                    </div>
                                </div>
                                <TextField
                                    label='Vouch / Exemption Note'
                                    placeholder='e.g. "Vouched for by Cpl. Smith" or "Requesting exemption — mature applicant with prior milsim leadership experience"'
                                    value={fields.ageExemptionNote}
                                    onChange={set('ageExemptionNote')}
                                    required
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    inputProps={{ maxLength: 500 }}
                                    helperText={`${fields.ageExemptionNote.length} / 500`}
                                    FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                                    sx={{
                                        ...inputSx,
                                        '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(245,158,11,0.4)' },
                                        '& .MuiOutlinedInput-root:hover fieldset': { borderColor: 'rgba(245,158,11,0.6)' },
                                        '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: '#f59e0b' },
                                        '& .MuiInputLabel-root.Mui-focused': { color: '#f59e0b' },
                                    }}
                                />
                            </div>
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
                </div>
            </div>

            {/* ── RIGHT COLUMN: Recruitment Process document panel ─────────────── */}
            <div
                className='xl:w-[40%]'
                style={{
                    overflowY: 'auto',
                    padding: '20px 24px',
                    background: 'rgba(0,0,0,0.14)',
                }}
            >
                {/* Panel header */}
                <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(219,0,29,0.2)' }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {'// RECRUITER GUIDE'}
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                        Recruitment Process
                    </div>
                </div>

                {/* Placeholder sections */}
                <DocSection title='Overview'>
                    <p style={{ margin: '0 0 8px' }}>
                        Recruitment instructions and process guidance will appear in this panel.
                        This section will provide step-by-step guidance for each stage of the recruitment workflow.
                    </p>
                    <p style={{ margin: 0 }}>
                        Interview questions and recruiter notes for the current step will be displayed here once content is finalised.
                    </p>
                </DocSection>

                <DocSection title='Recruiter Instructions'>
                    <p style={{ margin: '0 0 8px' }}>
                        Placeholder — recruiter instructions for each step will be added here.
                        Instructions will update based on the active step to guide the recruiter through the process.
                    </p>
                    <ul style={{ margin: '0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Review all applicant-provided information carefully.</li>
                        <li>Confirm details directly with the applicant where required.</li>
                        <li>Flag any concerns or exemptions before proceeding.</li>
                        <li>Complete all mandatory fields before advancing to the next step.</li>
                    </ul>
                </DocSection>

                <DocSection title='Questions to Ask'>
                    <p style={{ margin: '0 0 8px' }}>
                        Placeholder — interview questions and discussion points for each step will be listed here.
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Example: How did they find ASOT, and what draws them to milsim?</li>
                        <li>Example: Do they understand the operation schedule and time commitment?</li>
                        <li>Example: Are they familiar with basic infantry and communication procedures?</li>
                        <li>Example: Do they have any prior milsim or clan experience to discuss?</li>
                    </ul>
                </DocSection>

                <DocSection title='Notes'>
                    <p style={{ margin: 0 }}>
                        Placeholder — recruiter notes, flags, and observations will be captured here.
                        This section will support step-aware notes that follow the recruitment record.
                    </p>
                </DocSection>

                <DocSection title='Completion Requirements'>
                    <p style={{ margin: '0 0 8px' }}>
                        Placeholder — required conditions before finalising this recruitment record.
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>All mandatory fields across all seven steps must be completed.</li>
                        <li>Steam profile must be verified and resolved.</li>
                        <li>In-game name must be confirmed as available and appropriate.</li>
                        <li>Age requirements confirmed or exemption noted.</li>
                        <li>Primary role confirmed.</li>
                    </ul>
                </DocSection>

                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.15)', fontSize: '0.68rem', color: 'rgba(237,237,237,0.28)', lineHeight: 1.6, fontStyle: 'italic' }}>
                    Detailed recruitment questions and step-specific guidance will be added to this panel in a future update.
                </div>
            </div>

        </div>
    )
}
