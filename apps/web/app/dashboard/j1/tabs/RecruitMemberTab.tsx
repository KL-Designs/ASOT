'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
    Autocomplete, Checkbox, FormControlLabel, FormGroup,
} from '@mui/material'
import { PersonAdd, CheckCircle, Warning, ArrowForward, ArrowBack, HelpOutline, ContentCopy, ExpandMore, ExpandLess, Launch, PanTool } from '@mui/icons-material'
import { Typography } from '@mui/material'
import { containsOffensiveWord } from '@/lib/offensive-words'
import { type IntroProgress, RULES_QUESTIONS } from '@/app/recruit-session/StepContent'
import OrbatOnboarding from '@/app/recruit-session/OrbatOnboarding'
import ApplicantPageView, { STEP_LABELS } from '@/app/recruit-session/ApplicantPageView'
import BCTAvailabilityCalendar, { type BCTSlotSummary } from './BCTAvailabilityCalendar'

const RS_WS_URL = (process.env.NEXT_PUBLIC_BASEURL ?? '')
    .replace(/^http/, 'ws')
    .replace(/^https/, 'wss') + '/recruit-session'

const ASOT_TS_ADDRESS = process.env.NEXT_PUBLIC_TS_ADDRESS ?? 'ts.asotmilsim.com'
const TS3_DOWNLOAD = 'https://www.teamspeak.com/en/downloads/#ts3client'

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

// STEP_LABELS imported from ApplicantPageView (shared with applicant page)

const DEPT_DESCRIPTIONS: Record<string, string> = {
    'J1 — Recruitment': 'J1 are our gatekeepers to the unit. Their role is to interview potential recruits and determine if they are suitable for the community. If successful, J1 will then process them into the unit.',
    'J2 — Mission Making': 'J2 are our dedicated team who bring mission and campaign ideas to life. They are responsible for creating our weekly ARMA missions, as well as other ARMA mid-week missions and events.',
    'J3 — Training': 'J3 are our team of trainers who ensure all new members are to the standard required to join our operations. They also create and run unit trainings for general and specialist skills and roles.',
    'J4 — Company Headquarters': 'J4 are the head administrators and commanding officers of the unit. They hold overall command and oversee all administration within the community.',
    'J5 — Media': 'J5 are our media creation and management team. They focus on creating, sharing, and promoting unit content. They also manage the unit\'s MILPACs and social media accounts.',
    'J6 — Gamemasters (Zeus)': 'J6 is a vital asset to the successful conduct of our missions. The Zeus team takes the mission maker\'s vision and executes it for all members to enjoy. There is a full-time team and a part-time team.',
    'J7 — Community Development': 'J7 provides a lot of our features, in-game assets, modding, script creation, and more. They manage the dedicated ARMA server and other game servers, as well as the website and tools like MILPAC.',
}

interface MemberOption {
    id: string
    displayName: string
    username: string | null
    inGameName: string | null
    discharged: boolean
    isSkeleton: boolean
    isActiveMember: boolean
}

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

// ── Guide sub-components ────────────────────────────────────────────────────

const GuideSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 7 }}>
            {title}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>{children}</div>
    </div>
)

const ExampleQuote = ({ children }: { children: React.ReactNode }) => (
    <div style={{ margin: '8px 0 4px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(219,0,29,0.3)', fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic', lineHeight: 1.65 }}>
        {children}
    </div>
)

const TroubleshootItem = ({ issue, fixes }: { issue: string; fixes: string[] }) => (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(219,0,29,0.65)', marginBottom: 6 }}>{issue}</div>
        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {fixes.map((fix, i) => (
                <li key={i} style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>{fix}</li>
            ))}
        </ul>
    </div>
)

// Collapsible guide section — used in Introduction, Background, Availability, Roles guides.
// For Introduction: no checkbox (isDone driven by left-panel ticks, onToggleDone omitted).
// For Background/Availability/Roles: checkbox in the guide (onToggleDone provided).
function CollapsibleGuideSection({ title, isDone, onToggleDone, children }: {
    title: string
    isDone: boolean
    onToggleDone?: () => void
    children: React.ReactNode
}) {
    const [expanded, setExpanded] = useState(!isDone)
    useEffect(() => { setExpanded(!isDone) }, [isDone])

    return (
        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: expanded ? 8 : 0 }}>
                {onToggleDone !== undefined && (
                    <input type='checkbox' checked={isDone} onChange={onToggleDone}
                        style={{ cursor: 'pointer', accentColor: '#00c364', width: 14, height: 14, flexShrink: 0 }}
                    />
                )}
                <span style={{ flex: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: isDone ? '#00c364' : 'rgba(219,0,29,0.6)' }}>
                    {isDone && <span style={{ marginRight: 5 }}>✓</span>}{title}
                </span>
                {isDone && (
                    <button onClick={() => setExpanded(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', padding: '0 2px', display: 'flex' }}
                    >
                        {expanded ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                    </button>
                )}
            </div>
            {expanded && (
                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>
                    {children}
                </div>
            )}
        </div>
    )
}

export default function RecruitMemberTab({ displayName }: RecruitMemberTabProps) {
    const [step, setStep] = useState(1)

    // ── Interview Setup state ──────────────────────────────────────────────
    const [interviewChecklist, setInterviewChecklist] = useState({
        applicantConfirmed: false,
        sentTsAddress: false,
        installedTs: false,
        joinedTs: false,
        audioConfirmed: false,
        sentFollowAlong: false,
    })
    const [tsSetupOpen, setTsSetupOpen] = useState(false)
    const [tsCopied, setTsCopied] = useState(false)
    const [ts3LinkOpen, setTs3LinkOpen] = useState(false)
    const [ts3Copied, setTs3Copied] = useState(false)

    // ── Introduction state ─────────────────────────────────────────────────
    const [introChecklist, setIntroChecklist] = useState({
        warmWelcome: false,
        processExplained: false,
        backgroundExplained: false,
        valuesExplained: false,
    })

    // ── Background guide checklist ─────────────────────────────────────────
    const [bgChecklist, setBgChecklist] = useState({
        ageConfirmed: false,
        regionDiscussed: false,
        armaOwnershipConfirmed: false,
        milsimDiscussed: false,
        unitsDiscussed: false,
        communityIssuesCompleted: false,
    })

    // ── Availability guide checklist ───────────────────────────────────────
    const [availChecklist, setAvailChecklist] = useState({
        operationalNightsConfirmed: false,
        attendanceExplained: false,
        platoonNightStructureExplained: false,
    })

    // ── Roles guide checklist ──────────────────────────────────────────────
    const [rolesChecklist, setRolesChecklist] = useState({
        primaryRoleDiscussed: false,
        additionalRolesDiscussed: false,
        departmentInterestsDiscussed: false,
    })

    // ── Dept reference open state ──────────────────────────────────────────
    const [deptRefOpen, setDeptRefOpen] = useState(false)

    // ── Section 2: BCT state ───────────────────────────────────────────────
    const [bctChecklist, setBctChecklist] = useState({
        bctOverviewExplained: false,
        quizOptionDiscussed: false,
    })
    const [bctQuizRequested, setBctQuizRequested] = useState(false)
    const [bctAvailabilityNotes, setBctAvailabilityNotes] = useState('')
    const [bctExtraNotes, setBctExtraNotes] = useState('')
    const [bctCalendarSaving, setBctCalendarSaving] = useState(false)
    const [bctCalendarAdded, setBctCalendarAdded] = useState(false)
    const [bctCalendarChecklist, setBctCalendarChecklist] = useState({
        availabilityRecorded: false,
    })

    // ── Section 2: ORBAT state ─────────────────────────────────────────────
    const [orbatChecklist, setOrbatChecklist] = useState({
        platoon1Explained: false,
        platoon2Explained: false,
        platoon3Explained: false,
        reservistsExplained: false,
        attendanceExplained: false,
        loaExplained: false,
    })
    const [orbatHighlight, setOrbatHighlight] = useState<string | null>(null)

    // ── Section 3: Rules & Joining Agreement state ────────────────────────
    const [rulesIntroCompleted, setRulesIntroCompleted] = useState(false)
    const [rulesCurrentQuestion, setRulesCurrentQuestion] = useState(0)
    const [rulesAnswers, setRulesAnswers] = useState<Record<number, boolean | null>>({})
    const [rulesChecklist, setRulesChecklist] = useState<Record<string, boolean>>(
        Object.fromEntries(RULES_QUESTIONS.map((_, i) => [`q${i}`, false]))
    )

    // ── Section 4: Join Decision ───────────────────────────────────────────
    const [joinDecision, setJoinDecision] = useState<'yes' | 'no' | 'pending' | null>(null)
    const [joinDecisionReason, setJoinDecisionReason] = useState('')
    const [joinPendingDate, setJoinPendingDate] = useState('')
    const [joinPendingTime, setJoinPendingTime] = useState('')

    // ── Admin: TS/Discord ─────────────────────────────────────────────────
    const [tsLinkStatus, setTsLinkStatus] = useState<'idle' | 'pending' | 'linked' | 'failed'>('idle')
    const [tsNameConfirmed, setTsNameConfirmed] = useState(false)
    const [tsGroupsConfirmed, setTsGroupsConfirmed] = useState(false)
    const [tfarConfirmed, setTfarConfirmed] = useState(false)
    const [tfarSectionOpen, setTfarSectionOpen] = useState(true)
    const [tsSectionOpen, setTsSectionOpen] = useState(true)
    const [guideTsOpen, setGuideTsOpen] = useState(true)
    const [guideTfarOpen, setGuideTfarOpen] = useState(true)
    const [discordRolesAssigned, setDiscordRolesAssigned] = useState(false)

    // ── Pended / success state ─────────────────────────────────────────────
    const [pendedApplicationId, setPendedApplicationId] = useState('')
    const [reminderDate, setReminderDate] = useState('')
    const [reminderTime, setReminderTime] = useState('')
    const [reminderSaving, setReminderSaving] = useState(false)

    // ── Recruiter applicant preview ────────────────────────────────────────
    const [previewOpen, setPreviewOpen] = useState(false)

    // ── Form fields ────────────────────────────────────────────────────────
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

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<false | 'complete' | 'pended' | 'declined'>(false)

    const isDev = process.env.NODE_ENV === 'development'

    // ── Member + applicant picker ──────────────────────────────────────────
    const [memberList, setMemberList] = useState<CombinedOption[]>([])
    const [applicantList, setApplicantList] = useState<CombinedOption[]>([])
    const [membersLoading, setMembersLoading] = useState(true)
    const [selectedMember, setSelectedMember] = useState<CombinedOption | null>(null)
    const [pendingSelection, setPendingSelection] = useState<CombinedOption | null>(null)
    const [changeConfirmOpen, setChangeConfirmOpen] = useState(false)
    const [manualEntry, setManualEntry] = useState(false)

    // ── Returning member status ────────────────────────────────────────────
    const [returningStatus, setReturningStatus] = useState<'active' | 'discharged' | null>(null)
    const [returningName, setReturningName] = useState<string | null>(null)

    // ── Joining name check ─────────────────────────────────────────────────
    const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [nameSimilar, setNameSimilar] = useState<string[]>([])
    const [nameOffensive, setNameOffensive] = useState(false)
    const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [armaHoursAlert, setArmaHoursAlert] = useState(false)
    const armaHoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [ownsArmaTouched, setOwnsArmaTouched] = useState(false)

    // ── Steam resolution ───────────────────────────────────────────────────
    const [steamStatus, setSteamStatus] = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle')
    const [steamError, setSteamError] = useState<string | null>(null)

    // ── Live recruitment session ────────────────────────────────────────────
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [sessionToken, setSessionToken] = useState<string | null>(null)
    const [sessionUrl, setSessionUrl] = useState<string | null>(null)
    const [sessionCreating, setSessionCreating] = useState(false)
    const [sessionLinkCopied, setSessionLinkCopied] = useState(false)
    const [applicantConnected, setApplicantConnected] = useState(false)
    const [applicantLastActive, setApplicantLastActive] = useState<number | null>(null)
    const [raisedHand, setRaisedHand] = useState(false)
    const [applicantCursor, setApplicantCursor] = useState<{ x: number; y: number } | null>(null)
    const [wsReadyState, setWsReadyState] = useState<number>(WebSocket.CLOSED)
    const sessionWsRef = useRef<WebSocket | null>(null)
    const sessionReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const previewHeaderRef = useRef<HTMLDivElement>(null)

    // ── Draft auto-save & restore ──────────────────────────────────────────
    const [hasDraft, setHasDraft] = useState(false)
    const [draftLoaded, setDraftLoaded] = useState(false)
    const [draftPromptOpen, setDraftPromptOpen] = useState(false)
    const [draftStartNewConfirm, setDraftStartNewConfirm] = useState(false)
    const [savedDraft, setSavedDraft] = useState<Record<string, unknown> | null>(null)
    const [clearInProgressOpen, setClearInProgressOpen] = useState(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Load in-progress draft on mount
    useEffect(() => {
        fetch('/api/admin/j1/in-progress')
            .then(r => r.json())
            .then(data => {
                if (data.draft) {
                    setSavedDraft(data.draft)
                    setDraftPromptOpen(true)
                    setHasDraft(true)
                }
            })
            .catch(() => {})
            .finally(() => setDraftLoaded(true))
    }, [])

    useEffect(() => {
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

    function copyTsAddress() {
        if (!ASOT_TS_ADDRESS) return
        navigator.clipboard.writeText(ASOT_TS_ADDRESS).then(() => {
            setTsCopied(true)
            setTimeout(() => setTsCopied(false), 2000)
        })
    }

    function copyTs3Link() {
        navigator.clipboard.writeText(TS3_DOWNLOAD).then(() => {
            setTs3Copied(true)
            setTimeout(() => setTs3Copied(false), 2000)
        })
    }

    // ── Session management ─────────────────────────────────────────────────

    const connectSessionWs = useCallback((id: string, token: string) => {
        if (sessionWsRef.current?.readyState === WebSocket.OPEN) return
        const ws = new WebSocket(`${RS_WS_URL}?id=${id}&role=recruiter&token=${token}`)
        sessionWsRef.current = ws

        ws.onmessage = (event) => {
            let msg: Record<string, unknown>
            try { msg = JSON.parse(event.data) } catch { return }
            if (msg.type === 'state') {
                setApplicantConnected(!!msg.applicantConnected)
                if (msg.applicantLastActive) setApplicantLastActive(msg.applicantLastActive as number)
            } else if (msg.type === 'applicant-connected') {
                setApplicantConnected(true)
            } else if (msg.type === 'applicant-disconnected') {
                setApplicantConnected(false)
                setApplicantCursor(null)
                if (msg.lastActive) setApplicantLastActive(msg.lastActive as number)
            } else if (msg.type === 'raised-hand') {
                setRaisedHand(!!msg.value)
            } else if (msg.type === 'applicant-active') {
                setApplicantLastActive(msg.lastActive as number)
            } else if (msg.type === 'cursor') {
                setApplicantCursor({ x: msg.x as number, y: msg.y as number })
            } else if (msg.type === 'rules-answer') {
                setRulesAnswers(prev => ({ ...prev, [msg.questionIndex as number]: msg.answer as boolean }))
            } else if (msg.type === 'ts-link-request') {
                setTsLinkStatus('pending')
            }
        }

        ws.onopen = () => {
            setWsReadyState(WebSocket.OPEN)
        }

        ws.onclose = () => {
            setWsReadyState(WebSocket.CLOSED)
            sessionReconnectTimer.current = setTimeout(() => {
                connectSessionWs(id, token)
            }, 4000)
        }

        ws.onerror = () => ws.close()
    }, [])

    // Sync step to active session whenever step changes
    useEffect(() => {
        if (sessionWsRef.current?.readyState === WebSocket.OPEN && sessionId) {
            sessionWsRef.current.send(JSON.stringify({ type: 'step', step }))
        }
    }, [step, sessionId, wsReadyState])

    // Sync intro checklist sub-steps to applicant page
    useEffect(() => {
        if (step === 2 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({
                type: 'intro-sub',
                warmWelcome: introChecklist.warmWelcome,
                processExplained: introChecklist.processExplained,
                backgroundExplained: introChecklist.backgroundExplained,
                valuesExplained: introChecklist.valuesExplained,
            }))
        }
    }, [introChecklist, step, sessionId, wsReadyState])

    // Identity step — live name preview + validation status
    useEffect(() => {
        if (step === 4 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({
                type: 'name-preview',
                name: fields.joiningName,
                nameStatus,
                nameOffensive,
                nameSimilar,
            }))
        }
    }, [fields.joiningName, nameStatus, nameOffensive, nameSimilar, step, sessionId, wsReadyState])

    // Background step — checklist progress + field previews
    useEffect(() => {
        if (step === 5 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'bg-sub', ...bgChecklist }))
        }
    }, [bgChecklist, step, sessionId, wsReadyState])

    useEffect(() => {
        if (step === 5 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'field-preview', field: 'previousUnits', value: fields.previousUnits }))
        }
    }, [fields.previousUnits, step, sessionId, wsReadyState])

    useEffect(() => {
        if (step === 5 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'field-preview', field: 'currentUnit', value: fields.currentUnit }))
        }
    }, [fields.currentUnit, step, sessionId, wsReadyState])

    useEffect(() => {
        if (step === 5 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'field-preview', field: 'experience', value: fields.experience }))
        }
    }, [fields.experience, step, sessionId, wsReadyState])

    useEffect(() => {
        if (step === 5 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'field-preview', field: 'region', value: fields.region }))
        }
    }, [fields.region, step, sessionId, wsReadyState])

    // Availability step — selected nights + ops per month
    useEffect(() => {
        if (step === 6 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'avail-preview', availableNights: fields.availableNights, opsPerMonth: fields.opsPerMonth }))
        }
    }, [fields.availableNights, fields.opsPerMonth, step, sessionId, wsReadyState])

    // Roles step — primary role, additional roles, department interests
    useEffect(() => {
        if (step === 7 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'roles-preview', primaryRole: fields.primaryRole, additionalRoles: fields.additionalRoles, departmentInterest: fields.departmentInterest }))
        }
    }, [fields.primaryRole, fields.additionalRoles, fields.departmentInterest, step, sessionId, wsReadyState])

    // Joining Agreement step — advance current question shown to applicant
    useEffect(() => {
        if (step === 12 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'rules-question', questionIndex: rulesCurrentQuestion }))
        }
    }, [rulesCurrentQuestion, step, sessionId, wsReadyState])

    // ORBAT step — sync highlighted platoon to applicant
    useEffect(() => {
        if (step === 10 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'orbat-highlight', platoon: orbatHighlight }))
        }
    }, [orbatHighlight, step, sessionId, wsReadyState])

    // ORBAT step — sync sub-view (attendance/loa pages) to applicant
    useEffect(() => {
        if (step === 10 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            const subView = orbatChecklist.loaExplained ? 'loa'
                : orbatChecklist.attendanceExplained ? 'attendance'
                : 'main'
            sessionWsRef.current.send(JSON.stringify({ type: 'orbat-subview', subView }))
        }
    }, [orbatChecklist.attendanceExplained, orbatChecklist.loaExplained, step, sessionId, wsReadyState])

    // Admin step — sync TS link status to applicant
    useEffect(() => {
        if (step === 14 && sessionId && sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'ts-link-status', status: tsLinkStatus }))
        }
    }, [tsLinkStatus, step, sessionId, wsReadyState])

    // Auto-collapse TS + TFAR sections once TFAR is confirmed, to move focus to Discord
    useEffect(() => {
        if (tfarConfirmed) {
            setTfarSectionOpen(false)
            setTsSectionOpen(false)
            setGuideTsOpen(false)
            setGuideTfarOpen(false)
            setTsSetupOpen(false)
        }
    }, [tfarConfirmed])

    // Auto-collapse TS section once linked (TS is done, focus moves to TFAR)
    useEffect(() => {
        if (tsLinkStatus === 'linked') setTsSectionOpen(false)
    }, [tsLinkStatus])

    // Auto-save recruitment progress with debounce
    useEffect(() => {
        if (!draftLoaded) return
        const hasProgress = !!(sessionId || selectedMember || step > 1)
        if (!hasProgress) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
            fetch('/api/admin/j1/in-progress', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step, sessionId, sessionToken, sessionUrl,
                    selectedMember, manualEntry, fields,
                    interviewChecklist, introChecklist, bgChecklist,
                    availChecklist, rolesChecklist, bctChecklist,
                    bctQuizRequested, bctAvailabilityNotes, bctExtraNotes, bctCalendarChecklist,
                    orbatChecklist,
                    rulesIntroCompleted, rulesCurrentQuestion, rulesAnswers, rulesChecklist,
                    joinDecision, joinDecisionReason, joinPendingDate, joinPendingTime,
                    tsLinkStatus, tsNameConfirmed, tsGroupsConfirmed, tfarConfirmed,
                    discordRolesAssigned,
                }),
            }).then(() => setHasDraft(true)).catch(() => {})
        }, 1500)
    }, [
        draftLoaded, step, sessionId, sessionToken, sessionUrl,
        selectedMember, manualEntry, fields,
        interviewChecklist, introChecklist, bgChecklist, availChecklist, rolesChecklist,
        bctChecklist, bctQuizRequested, bctAvailabilityNotes, bctExtraNotes, bctCalendarChecklist,
        orbatChecklist,
        rulesIntroCompleted, rulesCurrentQuestion, rulesAnswers, rulesChecklist,
        joinDecision, joinDecisionReason, joinPendingDate, joinPendingTime,
        tsLinkStatus, tsNameConfirmed, tsGroupsConfirmed, tfarConfirmed, discordRolesAssigned,
    ])

    // Sync BCT quiz mode to applicant over WS
    useEffect(() => {
        if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
            sessionWsRef.current.send(JSON.stringify({ type: 'bct-quiz-mode', isQuiz: bctQuizRequested }))
        }
    }, [bctQuizRequested])

    // Recruiter cursor — broadcast to applicant when on step 9 (BCT calendar)
    const bctCursorTimer = useRef<number>(0)
    const calendarRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (step !== 9 || !sessionId) return
        function onMove(e: MouseEvent) {
            if (!calendarRef.current) return
            const now = Date.now()
            if (now - bctCursorTimer.current < 60) return
            bctCursorTimer.current = now
            if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
                const rect = calendarRef.current.getBoundingClientRect()
                sessionWsRef.current.send(JSON.stringify({
                    type: 'recruiter-cursor',
                    x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000,
                    y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000,
                }))
            }
        }
        window.addEventListener('mousemove', onMove)
        return () => window.removeEventListener('mousemove', onMove)
    }, [step, sessionId, wsReadyState])

    // Cleanup session WS on unmount
    useEffect(() => {
        return () => {
            sessionWsRef.current?.close()
            if (sessionReconnectTimer.current) clearTimeout(sessionReconnectTimer.current)
        }
    }, [])

    async function createSession() {
        setSessionCreating(true)
        try {
            const res = await fetch('/api/recruit-session', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) return
            setSessionId(data.sessionId)
            setSessionToken(data.recruiterToken)
            setSessionUrl(data.applicantUrl)
            connectSessionWs(data.sessionId, data.recruiterToken)
        } catch { /* silently fail */ } finally {
            setSessionCreating(false)
        }
    }

    function copySessionLink() {
        if (!sessionUrl) return
        navigator.clipboard.writeText(sessionUrl).then(() => {
            setSessionLinkCopied(true)
            setTimeout(() => setSessionLinkCopied(false), 2000)
        })
    }

    function clearRaisedHand() {
        setRaisedHand(false)
        sessionWsRef.current?.send(JSON.stringify({ type: 'lower-hand' }))
    }

    function formatLastActive(ts: number | null): string {
        if (!ts) return 'never'
        const secs = Math.round((Date.now() - ts) / 1000)
        if (secs < 10) return 'just now'
        if (secs < 60) return `${secs}s ago`
        return `${Math.round(secs / 60)}m ago`
    }

    const DEFAULT_FIELDS = {
        discordUsername: '', discordId: '', joiningName: '', recruiter: displayName,
        steamUrl: '', steamId64: '', region: '', regionCustom: '',
        age: '', armaHours: '', ownsArma: true, priorMilsim: false, dualClan: false,
        previousUnits: '', currentUnit: '', availableNights: '', opsPerMonth: '',
        primaryRole: '', additionalRoles: [] as string[], departmentInterest: [] as string[],
        heardAbout: '', heardAboutOther: '', experience: '', notes: '', ageExemptionNote: '',
    }

    function resetSetupState() {
        setInterviewChecklist({ applicantConfirmed: false, sentTsAddress: false, installedTs: false, joinedTs: false, audioConfirmed: false, sentFollowAlong: false })
        setIntroChecklist({ warmWelcome: false, processExplained: false, backgroundExplained: false, valuesExplained: false })
        setBgChecklist({ ageConfirmed: false, regionDiscussed: false, armaOwnershipConfirmed: false, milsimDiscussed: false, unitsDiscussed: false, communityIssuesCompleted: false })
        setAvailChecklist({ operationalNightsConfirmed: false, attendanceExplained: false, platoonNightStructureExplained: false })
        setRolesChecklist({ primaryRoleDiscussed: false, additionalRolesDiscussed: false, departmentInterestsDiscussed: false })
        setBctChecklist({ bctOverviewExplained: false, quizOptionDiscussed: false })
        setBctQuizRequested(false)
        setBctAvailabilityNotes('')
        setBctExtraNotes('')
        setBctCalendarSaving(false)
        setBctCalendarAdded(false)
        setBctCalendarChecklist({ availabilityRecorded: false })
        setOrbatChecklist({ platoon1Explained: false, platoon2Explained: false, platoon3Explained: false, reservistsExplained: false, attendanceExplained: false, loaExplained: false })
        setOrbatHighlight(null)
        setRulesIntroCompleted(false)
        setRulesCurrentQuestion(0)
        setRulesAnswers({})
        setRulesChecklist(Object.fromEntries(RULES_QUESTIONS.map((_, i) => [`q${i}`, false])))
        setJoinDecision(null)
        setJoinDecisionReason('')
        setJoinPendingDate('')
        setJoinPendingTime('')
        setTsLinkStatus('idle')
        setTsNameConfirmed(false)
        setTsGroupsConfirmed(false)
        setTfarConfirmed(false)
        setTfarSectionOpen(true)
        setTsSectionOpen(true)
        setDiscordRolesAssigned(false)
        setTsSetupOpen(false)
        setTsCopied(false)
        setTs3LinkOpen(false)
        setTs3Copied(false)
        setSessionLinkCopied(false)
        setDeptRefOpen(false)
    }

    function resetForm() {
        setStep(1)
        setFields(DEFAULT_FIELDS)
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
        resetSetupState()
    }

    function fullResetForm() {
        sessionWsRef.current?.close()
        sessionWsRef.current = null
        if (sessionReconnectTimer.current) {
            clearTimeout(sessionReconnectTimer.current)
            sessionReconnectTimer.current = null
        }
        setSessionId(null)
        setSessionToken(null)
        setSessionUrl(null)
        setApplicantConnected(false)
        setApplicantLastActive(null)
        setRaisedHand(false)
        setWsReadyState(WebSocket.CLOSED)
        resetForm()
    }

    async function clearDraftFully() {
        fetch('/api/admin/j1/in-progress', { method: 'DELETE' }).catch(() => {})
        setHasDraft(false)
        setSavedDraft(null)
        fullResetForm()
    }

    function restoreDraft(d: Record<string, any>) {
        if (typeof d.step === 'number') setStep(d.step)
        if (d.fields) setFields(d.fields)
        if (d.selectedMember) setSelectedMember(d.selectedMember)
        if (typeof d.manualEntry === 'boolean') setManualEntry(d.manualEntry)
        if (d.interviewChecklist) setInterviewChecklist(d.interviewChecklist)
        if (d.introChecklist) setIntroChecklist(d.introChecklist)
        if (d.bgChecklist) setBgChecklist(d.bgChecklist)
        if (d.availChecklist) setAvailChecklist(d.availChecklist)
        if (d.rolesChecklist) setRolesChecklist(d.rolesChecklist)
        if (d.bctChecklist) setBctChecklist(d.bctChecklist)
        if (typeof d.bctQuizRequested === 'boolean') setBctQuizRequested(d.bctQuizRequested)
        if (d.bctAvailabilityNotes !== undefined) setBctAvailabilityNotes(d.bctAvailabilityNotes)
        if (d.bctExtraNotes !== undefined) setBctExtraNotes(d.bctExtraNotes)
        if (d.bctCalendarChecklist) setBctCalendarChecklist(d.bctCalendarChecklist)
        if (d.orbatChecklist) setOrbatChecklist(d.orbatChecklist)
        if (typeof d.rulesIntroCompleted === 'boolean') setRulesIntroCompleted(d.rulesIntroCompleted)
        if (typeof d.rulesCurrentQuestion === 'number') setRulesCurrentQuestion(d.rulesCurrentQuestion)
        if (d.rulesAnswers) setRulesAnswers(d.rulesAnswers)
        if (d.rulesChecklist) setRulesChecklist(d.rulesChecklist)
        if (d.joinDecision !== undefined) setJoinDecision(d.joinDecision)
        if (d.joinDecisionReason !== undefined) setJoinDecisionReason(d.joinDecisionReason)
        if (d.joinPendingDate !== undefined) setJoinPendingDate(d.joinPendingDate)
        if (d.joinPendingTime !== undefined) setJoinPendingTime(d.joinPendingTime)
        if (d.tsLinkStatus) setTsLinkStatus(d.tsLinkStatus)
        if (typeof d.tsNameConfirmed === 'boolean') setTsNameConfirmed(d.tsNameConfirmed)
        if (typeof d.tsGroupsConfirmed === 'boolean') setTsGroupsConfirmed(d.tsGroupsConfirmed)
        if (typeof d.tfarConfirmed === 'boolean') setTfarConfirmed(d.tfarConfirmed)
        if (typeof d.discordRolesAssigned === 'boolean') setDiscordRolesAssigned(d.discordRolesAssigned)
        // Reconnect to existing applicant session
        if (d.sessionId && d.sessionToken) {
            setSessionId(d.sessionId)
            setSessionToken(d.sessionToken)
            setSessionUrl(d.sessionUrl ?? null)
            connectSessionWs(d.sessionId, d.sessionToken)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (nameStatus === 'taken' || nameOffensive) return
        if (fields.heardAbout === 'Other' && !fields.heardAboutOther.trim()) return
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
                if (!fields.ownsArma) {
                    setPendedApplicationId(String(data.id ?? data._id ?? ''))
                    fetch('/api/admin/j1/in-progress', { method: 'DELETE' }).catch(() => {})
                    setHasDraft(false)
                    setSuccess('pended')
                } else {
                    fetch('/api/admin/j1/in-progress', { method: 'DELETE' }).catch(() => {})
                    setHasDraft(false)
                    setSuccess('complete')
                    resetForm()
                }
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    function hasUnsavedProgress(): boolean {
        const anyInterviewTicked = Object.values(interviewChecklist).some(Boolean)
        return step > 1 ||
            anyInterviewTicked ||
            steamStatus === 'resolved' ||
            !!fields.joiningName.trim() ||
            !!fields.age ||
            !!fields.primaryRole
    }

    function applySelection(val: CombinedOption | null) {
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
        resetSetupState()

        if (!val) {
            setFields(DEFAULT_FIELDS)
            return
        }
        if (val.optionGroup === 'Applicants' && val.applicationData) {
            const a = val.applicationData
            setFields({
                ...DEFAULT_FIELDS,
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
                ...DEFAULT_FIELDS,
                discordUsername: val.username ?? val.displayName,
                discordId: val.id,
            })
        }
    }

    function isStepComplete(s: number): boolean {
        switch (s) {
            case 1:
                return !!fields.discordId.trim() &&
                    interviewChecklist.applicantConfirmed &&
                    interviewChecklist.sentTsAddress &&
                    interviewChecklist.installedTs &&
                    interviewChecklist.joinedTs &&
                    interviewChecklist.audioConfirmed &&
                    interviewChecklist.sentFollowAlong
            case 2:
                return introChecklist.warmWelcome &&
                    introChecklist.processExplained &&
                    introChecklist.backgroundExplained &&
                    introChecklist.valuesExplained
            case 3: return steamStatus === 'resolved'
            case 4: return !!fields.joiningName.trim() && nameStatus === 'available' && !nameOffensive
            case 5: {
                if (!fields.age || !fields.region) return false
                if (Number(fields.age) < 17 && !fields.ageExemptionNote.trim()) return false
                return bgChecklist.ageConfirmed && bgChecklist.regionDiscussed &&
                    bgChecklist.armaOwnershipConfirmed && bgChecklist.milsimDiscussed &&
                    bgChecklist.unitsDiscussed && bgChecklist.communityIssuesCompleted
            }
            case 6: return !!fields.availableNights && !!fields.opsPerMonth &&
                availChecklist.operationalNightsConfirmed && availChecklist.attendanceExplained &&
                availChecklist.platoonNightStructureExplained
            case 7: return !!fields.primaryRole &&
                rolesChecklist.primaryRoleDiscussed && rolesChecklist.additionalRolesDiscussed &&
                rolesChecklist.departmentInterestsDiscussed
            case 8: return bctChecklist.bctOverviewExplained && bctChecklist.quizOptionDiscussed
            case 9: return bctCalendarChecklist.availabilityRecorded
            case 10: return orbatChecklist.platoon1Explained && orbatChecklist.platoon2Explained && orbatChecklist.platoon3Explained && orbatChecklist.reservistsExplained && orbatChecklist.attendanceExplained && orbatChecklist.loaExplained
            case 11: return rulesIntroCompleted
            case 12: return RULES_QUESTIONS.every((q, i) => rulesAnswers[i] !== undefined && rulesAnswers[i] !== null && rulesAnswers[i] === q.correct)
            case 13: return joinDecision === 'yes'
            case 14: return !!fields.heardAbout && (fields.heardAbout !== 'Other' || !!fields.heardAboutOther.trim())
            default: return true
        }
    }

    const canAdvance = () => isStepComplete(step)

    function canNavigateTo(targetStep: number): boolean {
        if (targetStep <= step) return true       // always allow going back
        if (targetStep !== step + 1) return false  // only advance one step at a time
        return isStepComplete(step)               // can advance only if current step complete
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

    // doneSection wrapper is kept for structural grouping only — visual feedback is via doneSx on each field.
    const doneSection = (_done: boolean): React.CSSProperties => ({})
    const doneSx = (done: boolean) => !done ? inputSx : {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0, fontSize: '0.85rem',
            '& fieldset': { borderColor: 'rgba(0,195,100,0.45)' },
            '&:hover fieldset': { borderColor: 'rgba(0,195,100,0.65)' },
            '&.Mui-focused fieldset': { borderColor: '#00c364' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.85rem', color: 'rgba(0,195,100,0.7)' },
        '& .MuiInputLabel-root.Mui-focused': { color: '#00c364' },
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
        : nameStatus === 'taken' ? 'This name is already in use'
        : nameStatus === 'available' && !nameOffensive ? '✓ Name is available'
        : undefined
    const nameColor = nameStatus === 'available' && !nameOffensive ? '#00c364' : nameStatus === 'taken' ? '#db001d' : undefined

    // ── Vertical step nav ──────────────────────────────────────────────────
    const verticalStepNav = (
        <div style={{ width: 158, flexShrink: 0, borderRight: '1px solid var(--line-2)', paddingTop: 8, paddingBottom: 16 }}>
            {STEP_LABELS.map((label, i) => {
                const stepNum = i + 1
                const isDone = stepNum < step && isStepComplete(stepNum)
                const isActive = stepNum === step
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
                    disabled={loading || nameStatus === 'taken' || nameOffensive || (fields.heardAbout === 'Other' && !fields.heardAboutOther.trim())}
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

    // ── Step-specific guide content ────────────────────────────────────────
    function renderGuide() {
        switch (step) {
            case 1:
                return (
                    <>
                        <GuideSection title='Interview Setup'>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <li>Select and confirm the applicant at the top of this step.</li>
                                <li>Assist the applicant with downloading and installing TeamSpeak 3 if they do not already have it.</li>
                                <li>Send the applicant the ASOT TeamSpeak server address from the copy button.</li>
                                <li>Step them through connecting to the ASOT TeamSpeak server.</li>
                                <li>Select an interview room manually in TeamSpeak.</li>
                                <li>Keep a lookout for the applicant once they appear in TeamSpeak.</li>
                                <li>Drag them into the selected interview room.</li>
                                <li>Confirm their microphone and audio are working before continuing.</li>
                                <li>Generate the applicant follow-along link and send it to them.</li>
                                <li>Let them know the page will display information as the interview progresses.</li>
                                <li>Let them know they can raise their hand on the page at any time if they have a question.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;I&apos;m going to send you the ASOT TeamSpeak address now. Once you have TeamSpeak 3 open, connect to the server. I&apos;ll move you into an interview room once I see you join.&rdquo;
                            </ExampleQuote>
                            <ExampleQuote>
                                &ldquo;I&apos;m also going to send you a link. Open it on your phone or another screen if you can — it will show you helpful information as we go through the interview. You can also raise your hand on that page if you have a question at any time.&rdquo;
                            </ExampleQuote>
                        </GuideSection>
                    </>
                )
            case 2:
                return (
                    <>
                        <CollapsibleGuideSection title='Warm Welcome' isDone={introChecklist.warmWelcome}>
                            <ExampleQuote>
                                &ldquo;Hey mate, I&apos;m [Rank, Name], and I&apos;m one of ASOT&apos;s recruiters. Welcome to our community. It&apos;s good to have you here.&rdquo;
                            </ExampleQuote>
                            <div style={{ marginTop: 8 }}>If accompanied:</div>
                            <ExampleQuote>
                                &ldquo;Also with us today we have [Rank, Name], who is part of the recruitment team as well. They are here to assist with the interview and recruitment process.&rdquo;
                            </ExampleQuote>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Recruitment Process' isDone={introChecklist.processExplained}>
                            <ExampleQuote>
                                &ldquo;Before we get started, I&apos;ll quickly explain how the interview will run. It will be broken down into several sections.&rdquo;
                            </ExampleQuote>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {['Section 1 — Personal details, previous experience, availability, and interests.',
                                  'Section 2 — Basic Combat Trainings and Operation Details.',
                                  'Section 3 — Rules and expectations for all joining members.',
                                  'Section 4 — Processing into the group if they still wish to join.',
                                ].map((s, i) => (
                                    <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.73rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>{s}</div>
                                ))}
                            </div>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='ASOT Background' isDone={introChecklist.backgroundExplained}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <li>ASOT opened in August 2020.</li>
                                <li>Based on a fictional ADF-style department/corps.</li>
                                <li>ORBAT, procedures, and hierarchy structured to resemble the ADF.</li>
                                <li>Because ASOT is fictional, flexible use of vehicles, airframes, and weapons from different countries.</li>
                                <li>Aims to be warm, welcoming, and professional semi-serious milsim.</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Core Values & Operating Principles' isDone={introChecklist.valuesExplained}>
                            <div style={{ marginBottom: 8, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>Core Values</div>
                            <ul style={{ margin: '0 0 10px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <li>Community</li><li>Welcoming</li><li>Respect</li><li>Enjoyment</li>
                            </ul>
                            <div style={{ marginBottom: 8, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>Operating Principles</div>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <li>Professionalism</li><li>Competence</li><li>Realism with Purpose</li><li>Operational Flexibility</li>
                            </ul>
                            <div style={{ marginTop: 10, fontSize: '0.73rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>
                                &ldquo;You can view these further in your welcome pack, which will be provided at the end.&rdquo;
                            </div>
                        </CollapsibleGuideSection>
                    </>
                )
            case 3:
                return (
                    <GuideSection title='Steam'>
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <li>Ask the applicant to open Steam.</li>
                            <li>Ask them to go to their profile page.</li>
                            <li>Ask them to copy their Steam profile URL or Steam ID and send it to you.</li>
                            <li>Confirm the Steam account looks correct.</li>
                        </ul>
                        <ExampleQuote>
                            &ldquo;Can you open Steam, go to your profile, and send me your Steam profile link or Steam ID?&rdquo;
                        </ExampleQuote>
                    </GuideSection>
                )
            case 4:
                return (
                    <GuideSection title='Identity'>
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <li>Confirm what the applicant wants to be called in ASOT.</li>
                            <li>Inform them that the name cannot be longer than 12 characters.</li>
                            <li>Keep names simple and clear.</li>
                            <li>Avoid names that sound too close to current members.</li>
                            <li>Avoid offensive or inappropriate names.</li>
                            <li>If the name is flagged by the system, ask the applicant to choose another one.</li>
                        </ul>
                        <ExampleQuote>
                            &ldquo;What would you like to be called, or what would you like your name set to?&rdquo;
                        </ExampleQuote>
                    </GuideSection>
                )
            case 5:
                return (
                    <>
                        <CollapsibleGuideSection title='Age' isDone={bgChecklist.ageConfirmed} onToggleDone={() => setBgChecklist(p => ({ ...p, ageConfirmed: !p.ageConfirmed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm the applicant&apos;s age.</li>
                                <li>If the applicant is 16 or younger, they must be vouched for by a current member.</li>
                                <li>If they are under 16 and not vouched for, they cannot continue the application.</li>
                                <li>Thank them for their honesty and advise them to reapply when eligible or once vouched for.</li>
                                <li>Otherwise, applicants should generally be 17 or older.</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Region' isDone={bgChecklist.regionDiscussed} onToggleDone={() => setBgChecklist(p => ({ ...p, regionDiscussed: !p.regionDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm where the applicant is located.</li>
                                <li>If outside Oceania or Asia, advise they may experience higher latency.</li>
                                <li>Advise that time zone differences may affect availability.</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Arma 3 Ownership' isDone={bgChecklist.armaOwnershipConfirmed} onToggleDone={() => setBgChecklist(p => ({ ...p, armaOwnershipConfirmed: !p.armaOwnershipConfirmed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm whether they own Arma 3.</li>
                                <li>If not, the application can continue but will be marked as pending at the end.</li>
                                <li>They must purchase Arma 3 before officially joining the unit.</li>
                                <li>Arma 3 hours are useful context but not a major issue by themselves.</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Prior Milsim Experience' isDone={bgChecklist.milsimDiscussed} onToggleDone={() => setBgChecklist(p => ({ ...p, milsimDiscussed: !p.milsimDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Have you played in a milsim unit before?</li>
                                <li>What units or groups have you played with?</li>
                                <li>What roles have you done previously?</li>
                                <li>Have you held any leadership roles?</li>
                                <li>Have you helped with unit development, missions, or trainings?</li>
                                <li>What did you enjoy or dislike about those experiences?</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Current or Previous Units' isDone={bgChecklist.unitsDiscussed} onToggleDone={() => setBgChecklist(p => ({ ...p, unitsDiscussed: !p.unitsDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>If currently part of another Arma 3 milsim unit, ask for the name and record it.</li>
                                <li>If they left a previous community, ask why they left.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;You cannot be part of another modern warfare milsim group while a member of ASOT. Fantasy groups such as Star Wars, 40K, Altis Life are allowed.&rdquo;
                            </ExampleQuote>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Bans or Community Issues' isDone={bgChecklist.communityIssuesCompleted} onToggleDone={() => setBgChecklist(p => ({ ...p, communityIssuesCompleted: !p.communityIssuesCompleted }))}>
                            <ExampleQuote>
                                &ldquo;Have you ever been banned from, removed from, or had serious issues with a community from Arma 3 or any other milsim-related game?&rdquo;
                            </ExampleQuote>
                            <ul style={{ margin: '8px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Ask what happened and whether it was resolved.</li>
                                <li>Ask whether there is anything J1 should be aware of.</li>
                                <li>Do not pry too deeply.</li>
                                <li>Record any relevant details in Recruiter Notes.</li>
                            </ul>
                        </CollapsibleGuideSection>
                    </>
                )
            case 6:
                return (
                    <>
                        <CollapsibleGuideSection title='Operational Nights' isDone={availChecklist.operationalNightsConfirmed} onToggleDone={() => setAvailChecklist(p => ({ ...p, operationalNightsConfirmed: !p.operationalNightsConfirmed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm which operation nights they are available for.</li>
                                <li>Operations run Saturday and Sunday nights.</li>
                                <li>Record their preferred nights and estimated attendance per month.</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Attendance Expectations' isDone={availChecklist.attendanceExplained} onToggleDone={() => setAvailChecklist(p => ({ ...p, attendanceExplained: !p.attendanceExplained }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Call sign position: 3 weekends or missions per month.</li>
                                <li>Reservist position: 2 weekends per month.</li>
                                <li>Playing either Saturday or Sunday counts as a weekend — not required to attend both.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;Our attendance expectation for a normal call sign position is three weekends per month. Reservists are expected to attend two weekends per month. You do not need to attend both Saturday and Sunday for it to count as a weekend.&rdquo;
                            </ExampleQuote>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Platoon Night Structure' isDone={availChecklist.platoonNightStructureExplained} onToggleDone={() => setAvailChecklist(p => ({ ...p, platoonNightStructureExplained: !p.platoonNightStructureExplained }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>1 Platoon operates on Saturday night.</li>
                                <li>2 Platoon operates on Sunday night.</li>
                                <li>3 Platoon is the support platoon and spans both Saturday and Sunday.</li>
                            </ul>
                        </CollapsibleGuideSection>
                    </>
                )
            case 7:
                return (
                    <>
                        <CollapsibleGuideSection title='Primary Role' isDone={rolesChecklist.primaryRoleDiscussed} onToggleDone={() => setRolesChecklist(p => ({ ...p, primaryRoleDiscussed: !p.primaryRoleDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm their primary role interest.</li>
                            </ul>
                            <div style={{ marginTop: 8, marginBottom: 4, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>Potential questions to ask</div>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Have you done this role before?</li>
                                <li>What interests you about this role?</li>
                                <li>Are there any roles you definitely do not want to do?</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Additional Roles' isDone={rolesChecklist.additionalRolesDiscussed} onToggleDone={() => setRolesChecklist(p => ({ ...p, additionalRolesDiscussed: !p.additionalRolesDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm any additional roles they selected.</li>
                                <li>Do they have questions about any of those roles?</li>
                            </ul>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='Department Interests' isDone={rolesChecklist.departmentInterestsDiscussed} onToggleDone={() => setRolesChecklist(p => ({ ...p, departmentInterestsDiscussed: !p.departmentInterestsDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Confirm any departments they are interested in.</li>
                                <li>Do they have questions about the departments?</li>
                            </ul>
                        </CollapsibleGuideSection>

                        {/* Yellow position note */}
                        <div style={{ margin: '10px 0', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', fontSize: '0.73rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                            Members can move around positions and do not have to remain in their first selected role forever. Role assignment depends on unit needs, suitability, training, and availability.
                        </div>

                        {/* Collapsible department reference */}
                        <div style={{ marginTop: 8 }}>
                            <button type='button' onClick={() => setDeptRefOpen(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}
                            >
                                {deptRefOpen ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                                Department Reference
                            </button>
                            {deptRefOpen && (
                                <div style={{ padding: '12px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                                    {Object.entries(DEPT_DESCRIPTIONS).map(([name, desc]) => (
                                        <div key={name} style={{ marginBottom: 12 }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(219,0,29,0.55)', marginBottom: 3 }}>{name}</div>
                                            <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>{desc}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )
            case 8:
                return (
                    <>
                        <CollapsibleGuideSection title='BCT Overview' isDone={bctChecklist.bctOverviewExplained} onToggleDone={() => setBctChecklist(p => ({ ...p, bctOverviewExplained: !p.bctOverviewExplained }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>All new members must complete BCT Stage 1 and Stage 2 to officially join.</li>
                                <li>Stage 1 covers essential military skills and familiarisation with the mod set.</li>
                                <li>Once Stage 1 is complete, they are cleared to attend operations as a recruit.</li>
                                <li>Stage 2 builds on Stage 1 with advanced procedures and medical training.</li>
                                <li>Stage 2 completion is required to earn the rank of Private.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;Are you able to attend a BCT Stage 1 session within the next 30 days?&rdquo;
                            </ExampleQuote>
                            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '2px solid #f59e0b', fontSize: '0.73rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                                There is a one-month time limit to complete BCT Stage 1. If not completed, the application may be removed. Let the applicant know training takes approximately 2 hours.
                            </div>
                        </CollapsibleGuideSection>
                        <CollapsibleGuideSection title='BCT1 Confirmation Quiz' isDone={bctChecklist.quizOptionDiscussed} onToggleDone={() => setBctChecklist(p => ({ ...p, quizOptionDiscussed: !p.quizOptionDiscussed }))}>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>The BCT1 Confirmation Quiz is designed for applicants with prior MILSIM experience.</li>
                                <li>It applies to applicants who already know the mods and training material.</li>
                                <li>Applicants may request to complete the quiz instead of the standard BCT1 course.</li>
                                <li>Only J3 personnel can conduct and approve this quiz.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;If you have significant prior MILSIM experience and are already familiar with the mods, you can request to complete a BCT1 confirmation quiz instead of the full course.&rdquo;
                            </ExampleQuote>
                        </CollapsibleGuideSection>
                    </>
                )

            case 9:
                return (
                    <>
                        <GuideSection title='BCT Availability'>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Ask the applicant which days and times they are generally available for BCT.</li>
                                <li>Record their preferred days and time periods below.</li>
                                <li>This information will be shared with the J3 training team for scheduling.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;What days and times of the week are you generally free? For example, evenings during the week, or weekend days?&rdquo;
                            </ExampleQuote>
                        </GuideSection>
                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.6, fontStyle: 'italic' }}>
                            Interactive J3 calendar integration coming in a future update. Record availability in notes for now.
                        </div>
                    </>
                )

            case 10:
                return (
                    <>
                        <GuideSection title='ORBAT — Tick each platoon as explained'>
                            <div style={{ marginBottom: 6, fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>
                                Ticking each platoon highlights it on the applicant&apos;s live page.
                            </div>
                        </GuideSection>
                        {([
                            { key: 'platoon1Explained' as const, label: '1 Platoon', detail: 'Operates Saturday nights', id: '1P' },
                            { key: 'platoon2Explained' as const, label: '2 Platoon', detail: 'Operates Sunday nights', id: '2P' },
                            { key: 'platoon3Explained' as const, label: '3 Platoon', detail: 'Support platoon — both nights', id: '3P' },
                            { key: 'reservistsExplained' as const, label: 'Reservists', detail: 'Attached across both nights', id: 'RES' },
                        ]).map(({ key, label, detail, id }) => (
                            <div key={key} style={{ marginBottom: 8, padding: '10px 12px', background: orbatChecklist[key] ? 'rgba(0,195,100,0.03)' : 'rgba(255,255,255,0.02)', border: `1px solid ${orbatChecklist[key] ? 'rgba(0,195,100,0.2)' : 'rgba(255,255,255,0.06)'}`, transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type='checkbox' checked={orbatChecklist[key]}
                                        onChange={() => {
                                            const next = !orbatChecklist[key]
                                            setOrbatChecklist(p => ({ ...p, [key]: next }))
                                            setOrbatHighlight(next ? id : null)
                                        }}
                                        style={{ cursor: 'pointer', accentColor: '#00c364', width: 13, height: 13, flexShrink: 0 }}
                                    />
                                    <button type='button' onClick={() => setOrbatHighlight(orbatHighlight === id ? null : id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1, padding: 0 }}
                                    >
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: orbatChecklist[key] ? '#00c364' : 'rgba(237,237,237,0.7)', display: 'block' }}>{label}</span>
                                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)' }}>{detail}</span>
                                    </button>
                                    {orbatHighlight === id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(219,0,29,0.7)', flexShrink: 0 }} />}
                                </div>
                            </div>
                        ))}
                        {/* Attendance and LOA use plain sections (not collapsible) — ticking them switches
                            the applicant's live page to a dedicated informational sub-page, so they should
                            always remain visible to the recruiter while explaining. */}
                        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <input type='checkbox' checked={orbatChecklist.attendanceExplained}
                                    onChange={() => setOrbatChecklist(p => ({ ...p, attendanceExplained: !p.attendanceExplained }))}
                                    style={{ cursor: 'pointer', accentColor: '#00c364', width: 14, height: 14, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: orbatChecklist.attendanceExplained ? '#00c364' : 'rgba(219,0,29,0.6)' }}>
                                    {orbatChecklist.attendanceExplained && <span style={{ marginRight: 5 }}>✓</span>}Attendance Expectations
                                </span>
                                {orbatChecklist.attendanceExplained && (
                                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: 'var(--amber)', fontWeight: 600, letterSpacing: '0.06em' }}>APPLICANT PAGE SWITCHED</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>
                                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <li>Full call sign position: approximately 3 weekends per month.</li>
                                    <li>Reservist position: minimum 2 weekends per month.</li>
                                    <li>Either Saturday or Sunday counts as one weekend.</li>
                                </ul>
                                <ExampleQuote>
                                    &ldquo;Reservists cannot commit to full-time attendance. They attend a minimum of two weekends per month where possible.&rdquo;
                                </ExampleQuote>
                            </div>
                        </div>

                        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <input type='checkbox' checked={orbatChecklist.loaExplained}
                                    onChange={() => setOrbatChecklist(p => ({ ...p, loaExplained: !p.loaExplained }))}
                                    style={{ cursor: 'pointer', accentColor: '#00c364', width: 14, height: 14, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: orbatChecklist.loaExplained ? '#00c364' : 'rgba(219,0,29,0.6)' }}>
                                    {orbatChecklist.loaExplained && <span style={{ marginRight: 5 }}>✓</span>}Leave of Absence (LOA)
                                </span>
                                {orbatChecklist.loaExplained && (
                                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: 'var(--amber)', fontWeight: 600, letterSpacing: '0.06em' }}>APPLICANT PAGE SWITCHED</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>
                                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <li>LOAs granted for up to one month, extendable to three months.</li>
                                    <li>Beyond three months may move to inactive reservist status.</li>
                                    <li>Going AWOL without communication is not acceptable.</li>
                                </ul>
                            </div>
                        </div>
                    </>
                )

            case 11:
                return (
                    <GuideSection title='Rules &amp; Expectations'>
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <li>Read out the community rules verbally to the applicant.</li>
                            <li>Explain the reasoning behind each rule briefly.</li>
                            <li>Answer any questions the applicant has.</li>
                            <li>Tick &ldquo;Rules overview complete&rdquo; in the centre section once done.</li>
                            <li>The next step (Joining Agreement) will ask the applicant to confirm each rule individually.</li>
                        </ul>
                        <ExampleQuote>
                            &ldquo;In this section I&apos;m going to outline some of the key rules and expectations for all members within the community.&rdquo;
                        </ExampleQuote>
                    </GuideSection>
                )

            case 12: {
                const correctCount = RULES_QUESTIONS.filter((q, i) => rulesAnswers[i] === q.correct).length
                const wrongCount = RULES_QUESTIONS.filter((q, i) => rulesAnswers[i] !== undefined && rulesAnswers[i] !== null && rulesAnswers[i] !== q.correct).length
                const answeredCount = RULES_QUESTIONS.filter((q, i) => rulesAnswers[i] !== undefined && rulesAnswers[i] !== null).length
                return (
                    <div>
                        <GuideSection title='Joining Agreement'>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Read each question to the applicant from the centre section.</li>
                                <li>Ask the applicant to answer YES or NO on their follow-along page.</li>
                                <li>Navigate questions using PREV / NEXT in the centre section.</li>
                                <li>All 8 answers must be correct before you can continue.</li>
                            </ul>
                            <ExampleQuote>
                                &ldquo;I&apos;m going to read you a few questions now. Please read along on your page and answer YES or NO using the buttons.&rdquo;
                            </ExampleQuote>
                        </GuideSection>

                        {/* Answer progress summary */}
                        <div style={{ padding: '10px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 2 }}>
                                Progress
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {RULES_QUESTIONS.map((q, i) => {
                                    const ans = rulesAnswers[i]
                                    const isWrong = ans !== null && ans !== undefined && ans !== q.correct
                                    const isCorrect = ans !== null && ans !== undefined && !isWrong
                                    const isCurrent = i === rulesCurrentQuestion
                                    return (
                                        <button key={i} type='button' onClick={() => setRulesCurrentQuestion(i)}
                                            title={`Q${i + 1}: ${q.question}`}
                                            style={{
                                                width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 2,
                                                fontSize: '0.6rem', fontWeight: 700,
                                                background: isWrong ? 'var(--amber)' : isCorrect ? '#00c364' : isCurrent ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)',
                                                color: isWrong || isCorrect || isCurrent ? '#fff' : 'rgba(237,237,237,0.4)',
                                                outline: isCurrent ? '2px solid rgba(219,0,29,0.7)' : 'none',
                                                outlineOffset: 2,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {i + 1}
                                        </button>
                                    )
                                })}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5 }}>
                                {answeredCount} of {RULES_QUESTIONS.length} answered
                                {correctCount > 0 && <span style={{ color: '#00c364', marginLeft: 8 }}>✓ {correctCount} correct</span>}
                                {wrongCount > 0 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>⚠ {wrongCount} need clarification</span>}
                            </div>
                        </div>
                    </div>
                )
            }

            case 13:
                return (
                    <GuideSection title='Join Decision'>
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>Ask if the applicant has any remaining questions.</li>
                            <li>Confirm whether they still wish to continue joining ASOT.</li>
                            <li>Select YES, NO, or PENDING based on their answer.</li>
                        </ul>
                        <ExampleQuote>
                            &ldquo;Do you have any questions about anything we have covered today?&rdquo;
                        </ExampleQuote>
                        <ExampleQuote>
                            &ldquo;After everything we&apos;ve gone through, would you still like to continue joining ASOT?&rdquo;
                        </ExampleQuote>
                        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.6 }}>
                            <strong style={{ color: 'rgba(0,195,100,0.8)' }}>YES</strong> — Continue to Admin onboarding.<br />
                            <strong style={{ color: 'rgba(219,0,29,0.8)' }}>NO</strong> — Close the application for J1 lead review.<br />
                            <strong style={{ color: 'var(--amber)' }}>PENDING</strong> — Applicant needs more time. Set a chase-up.
                        </div>
                    </GuideSection>
                )

            case 14:
                return (
                    <>
                        {/* TeamSpeak Onboarding — collapsible, auto-collapses on tfarConfirmed */}
                        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
                            <button type='button' onClick={() => setGuideTsOpen(v => !v)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, background: 'none', border: 'none', cursor: 'pointer', marginBottom: guideTsOpen ? 7 : 0 }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {tfarConfirmed && <span style={{ fontSize: '0.65rem', color: '#00c364' }}>✓</span>}
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: tfarConfirmed ? '#00c364' : 'rgba(219,0,29,0.6)' }}>
                                        TeamSpeak Onboarding
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)' }}>{guideTsOpen ? '[−]' : '[+]'}</span>
                            </button>
                            {guideTsOpen && (
                                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>
                                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <li>Link the applicant&apos;s TeamSpeak account using the button below.</li>
                                        <li>Once linked, assign the following server groups:</li>
                                    </ul>
                                    <div style={{ margin: '8px 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {['~~~ CITATIONS & AWARDS ~~~', '~~~ CERTIFICATIONS ~~~', '~~~ Rank ~~~', 'REC - Recruit', '~~~ Unit ~~~', 'ASOT', '~~~ Campaign Medals ~~~'].map(g => (
                                            <div key={g} style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', padding: '2px 6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>{g}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* TFAR Installation — collapsible, auto-collapses on tfarConfirmed */}
                        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
                            <button type='button' onClick={() => setGuideTfarOpen(v => !v)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, background: 'none', border: 'none', cursor: 'pointer', marginBottom: guideTfarOpen ? 7 : 0 }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {tfarConfirmed && <span style={{ fontSize: '0.65rem', color: '#00c364' }}>✓</span>}
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: tfarConfirmed ? '#00c364' : 'rgba(219,0,29,0.6)' }}>
                                        TFAR Installation
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)' }}>{guideTfarOpen ? '[−]' : '[+]'}</span>
                            </button>
                            {guideTfarOpen && (
                                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.75 }}>
                                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <li>Direct the applicant to the <strong>Download TFAR Plugin</strong> button on their follow-along page.</li>
                                        <li>Have them open the downloaded file and click <strong>Install</strong>.</li>
                                        <li>Have them reconnect to TeamSpeak after installation.</li>
                                        <li>Confirm &ldquo;Task Force Radio Status&rdquo; appears when clicking their TS name.</li>
                                        <li>If not visible: Tools → Options → Addons.</li>
                                    </ul>
                                    <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.15)', fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                                        The plugin is served directly from the ASOT website. Do not proceed until TFAR is visually confirmed in TeamSpeak.
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                            <button type='button' onClick={() => setTsSetupOpen(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 12px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.7)', textAlign: 'left' }}
                            >
                                {tsSetupOpen ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                                TFAR TROUBLESHOOTING
                            </button>
                            {tsSetupOpen && (
                                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                                    <TroubleshootItem issue='"Plugin failed to load: Api version not compatible"'
                                        fixes={['Wrong or multiple TFAR versions installed.', 'Delete old plugin files manually:', 'C:\\Users\\(USER)\\AppData\\TeamSpeak 3\\plugins', 'C:\\Program Files (x86)\\TeamSpeak 3 Client\\plugins', 'Reinstall the latest TFAR plugin.']}
                                    />
                                    <TroubleshootItem issue='"Failed to install addon. Retry as administrator."'
                                        fixes={['Close TeamSpeak fully before installing.', 'Enable Developer Mode in TeamSpeak settings.', 'Restart the PC and try again.', 'Run TeamSpeak as Administrator and retry.', 'Reinstall TeamSpeak if issues persist.', 'Manual install: copy plugin file to plugin folder.', 'Plugin paths: AppData\\TeamSpeak 3\\plugins OR AppData\\Roaming\\TS3Client\\plugins', 'Troubleshooting drive: drive.google.com/drive/folders/1GYTcUyYxELEvG5Nl-AfM9KTNkPstFB8g']}
                                    />
                                    <TroubleshootItem issue='TFAR plugin asks which program to open with'
                                        fixes={['Search for createfileassoc.exe and run it.', 'Then retry the installation.']}
                                    />
                                    <TroubleshootItem issue='Cannot run task_force_radio.ts3_plugin'
                                        fixes={['Check they are using TeamSpeak 3 (not TeamSpeak 5).', 'Use package_inst.exe to open the plugin with the TeamSpeak 3 package installer.']}
                                    />
                                    <TroubleshootItem issue='TFAR errors after restarting TeamSpeak'
                                        fixes={['This is a file duality issue — restart the PC.']}
                                    />
                                    <TroubleshootItem issue='"The file or directory is corrupted and unreadable."'
                                        fixes={['Use the manual TFAR fix package from the J1 Recruitment Google Drive.', 'Replace plugin files manually and restart TeamSpeak.', 'If AppData is hidden: File Explorer → View → enable Hidden Items.']}
                                    />
                                </div>
                            )}
                        </div>
                        <GuideSection title='Discord Onboarding'>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>Assign Discord roles: <strong>ASOT Member</strong>, <strong>Recruit</strong></li>
                                <li>Remove Discord roles: <strong>Welcome</strong>, <strong>Applicant</strong></li>
                                <li>Rename applicant: add <strong>REC -</strong> prefix (e.g. REC ApplicantName)</li>
                                <li>Walk the applicant through key Discord channels.</li>
                            </ul>
                        </GuideSection>
                        <GuideSection title='Admin — Final Check'>
                            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <li>Confirm how they heard about ASOT.</li>
                                <li>If they select &ldquo;Other&rdquo;, ensure they specify — this field is required.</li>
                                <li>Review all recruiter notes before submitting.</li>
                            </ul>
                        </GuideSection>
                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.15)', fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                            Once submitted, the record will appear in the Applications tab and will await sign-off from a J1 lead.
                        </div>
                    </>
                )

            default:
                return null
        }
    }

    if (success === 'declined') return (
        <div style={{ padding: '20px 24px', maxWidth: 560 }} className='flex flex-col gap-4'>
            <div className='flex items-center gap-3 px-4 py-4' style={{ border: '1px solid rgba(219,0,29,0.25)', borderLeft: '2px solid var(--red)', background: 'rgba(219,0,29,0.04)' }}>
                <Warning style={{ fontSize: 20, color: 'var(--red)', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 2 }}>Application closed — applicant declined to continue</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>The record has been submitted for J1 lead review.</div>
                </div>
            </div>
            <Button onClick={() => { clearDraftFully(); setSuccess(false) }} sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 16px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}>
                ADD ANOTHER RECRUIT
            </Button>
        </div>
    )

    if (success === 'complete') return (
        <div style={{ padding: '20px 24px', maxWidth: 560 }} className='flex flex-col gap-4'>
            <div className='flex items-center gap-3 px-4 py-4' style={{ border: '1px solid rgba(0,195,100,0.2)', borderLeft: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}>
                <CheckCircle style={{ fontSize: 20, color: '#00c364', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 2 }}>Recruit logged — pending J1 lead approval</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>The record is in the Applications tab and awaits sign-off from a J1 lead.</div>
                </div>
            </div>
            <Button onClick={() => { clearDraftFully(); setSuccess(false) }} sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 16px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}>
                ADD ANOTHER RECRUIT
            </Button>
        </div>
    )

    if (success === 'pended') return (
        <div style={{ padding: '20px 24px', maxWidth: 560 }} className='flex flex-col gap-4'>
            <div className='flex items-center gap-3 px-4 py-4' style={{ border: '1px solid rgba(245,158,11,0.25)', borderLeft: '2px solid #f59e0b', background: 'rgba(245,158,11,0.04)' }}>
                <Warning style={{ fontSize: 20, color: 'var(--amber)', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 2 }}>Application pended — applicant does not currently own Arma 3</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>
                        The record has been logged and a note added. The application is paused until the applicant purchases Arma 3.
                    </div>
                </div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 10 }}>
                    Set a Chaser Reminder
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 12, lineHeight: 1.55 }}>
                    Set a date and time to follow up with the applicant about whether they have purchased Arma 3.
                </div>
                <div className='grid grid-cols-2 gap-3' style={{ marginBottom: 10 }}>
                    <TextField
                        type='date' label='Reminder Date' value={reminderDate}
                        onChange={e => setReminderDate(e.target.value)}
                        fullWidth InputLabelProps={{ shrink: true }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.85rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' } }}
                    />
                    <TextField
                        type='time' label='Reminder Time' value={reminderTime}
                        onChange={e => setReminderTime(e.target.value)}
                        fullWidth InputLabelProps={{ shrink: true }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.85rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' } }}
                    />
                </div>
                <Button
                    onClick={async () => {
                        if (!reminderDate) return
                        setReminderSaving(true)
                        try {
                            await fetch('/api/admin/tasks', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title: `Arma 3 chaser — ${fields.discordUsername || fields.discordId}`,
                                    description: `Follow up with applicant to confirm whether they have purchased Arma 3. Application ID: ${pendedApplicationId}`,
                                    dueDate: reminderDate + (reminderTime ? `T${reminderTime}` : 'T09:00'),
                                    notifyAssignee: true,
                                }),
                            })
                        } catch { /* silently ignore — task creation is best-effort */ } finally {
                            setReminderSaving(false)
                        }
                    }}
                    disabled={!reminderDate || reminderSaving}
                    variant='contained'
                    sx={{ borderRadius: 0, background: 'rgba(219,0,29,0.8)', fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.75rem', '&:hover': { background: 'var(--red)' }, '&.Mui-disabled': { background: 'rgba(219,0,29,0.2)', color: 'rgba(237,237,237,0.3)' } }}
                >
                    {reminderSaving ? 'SAVING…' : 'SET REMINDER'}
                </Button>
            </div>

            <Button onClick={() => { clearDraftFully(); setSuccess(false) }} sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 16px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}>
                ADD ANOTHER RECRUIT
            </Button>
        </div>
    )

    return (
        <>
        {/* overflow-anchor:none prevents the browser from jumping scroll when guide sections collapse */}
        <style>{`.recruit-form-area { overflow-anchor: none; }`}</style>
        <div className='flex flex-col xl:flex-row' style={{ minHeight: '700px', alignItems: 'stretch', contain: 'layout' }}>

            {/* Change-applicant confirmation modal */}
            {changeConfirmOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0f0f0f', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 420, width: '90%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'// CONFIRM'}</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(237,237,237,0.9)', textTransform: 'uppercase' }}>Change Applicant?</div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>You have unsaved changes. Changing applicant will clear the current form data.</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => { setChangeConfirmOpen(false); setPendingSelection(null) }} style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.5)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em' }}>CANCEL</button>
                            <button onClick={() => { setChangeConfirmOpen(false); applySelection(pendingSelection); setPendingSelection(null) }} style={{ background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em' }}>CHANGE APPLICANT</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Draft Restore Modal */}
            {draftPromptOpen && savedDraft && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0f0f10', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'// IN-PROGRESS RECRUITMENT'}</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Continue Previous Recruitment?</div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.65 }}>
                            You have an in-progress recruitment
                            {savedDraft.selectedMember ? ` for ${(savedDraft.selectedMember as { displayName: string }).displayName}` : ''}.{' '}
                            Would you like to continue where you left off or start a new recruitment?
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            <button onClick={() => {
                                restoreDraft(savedDraft)
                                setDraftPromptOpen(false)
                            }}
                                style={{ flex: 1, minWidth: 120, padding: '9px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.9)', cursor: 'pointer' }}
                            >CONTINUE PREVIOUS</button>
                            <button onClick={() => setDraftStartNewConfirm(true)}
                                style={{ padding: '9px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}
                            >START NEW</button>
                            <button onClick={() => setDraftPromptOpen(false)}
                                style={{ padding: '9px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(237,237,237,0.08)', color: 'rgba(237,237,237,0.3)', cursor: 'pointer' }}
                            >CANCEL</button>
                        </div>
                    </div>
                    {/* Second confirmation for "Start New" */}
                    {draftStartNewConfirm && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ background: '#0f0f10', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 400, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Start New Recruitment?</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>
                                    The in-progress recruitment{savedDraft.selectedMember ? ` for ${(savedDraft.selectedMember as { displayName: string }).displayName}` : ''} will be permanently cleared. This cannot be undone.
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setDraftStartNewConfirm(false)}
                                        style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                    >CANCEL</button>
                                    <button onClick={() => { clearDraftFully(); setDraftStartNewConfirm(false); setDraftPromptOpen(false) }}
                                        style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: 'pointer' }}
                                    >CLEAR &amp; START NEW</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Clear In-Progress Confirmation Modal */}
            {clearInProgressOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0f0f10', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'// CONFIRM CLEAR'}</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Clear In-Progress Applicant?</div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>
                            This will clear the current in-progress recruitment and remove all saved progress for this applicant. This action cannot be undone.
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => setClearInProgressOpen(false)}
                                style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                            >CANCEL</button>
                            <button onClick={() => { clearDraftFully(); setClearInProgressOpen(false) }}
                                style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: 'pointer' }}
                            >CLEAR APPLICANT</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LEFT COLUMN ───────────────────────────────────────────────────── */}
            <div className='xl:w-[60%]' style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line-2)', minWidth: 0, minHeight: '500px' }}>

                {/* Header */}
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line-2)' }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 4, fontFamily: 'monospace' }}>
                        J1 — DIRECT RECRUITMENT
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                        Complete all steps to log a recruit. Data is preserved when navigating between steps.
                    </div>
                </div>

                {/* Step nav + form — minHeight prevents left panel collapsing when right guide changes */}
                <div style={{ display: 'flex', flex: 1, minHeight: '300px' }}>
                    {verticalStepNav}

                    <div className='recruit-form-area' style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
                        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>

                            {/* ── Step 1: Interview Setup ── */}
                            {step === 1 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 1 — Interview Setup', 'Select the applicant, assist with TeamSpeak setup, then send the follow-along link.')}

                                    {hasDraft && (
                                        <div style={{ marginBottom: 8 }}>
                                            <button type='button' onClick={() => setClearInProgressOpen(true)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.65)', cursor: 'pointer' }}
                                            >
                                                ✕ Clear In-Progress Applicant
                                            </button>
                                        </div>
                                    )}

                                    {/* ── Section A: Applicant Selection ── */}
                                    <div style={{ paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 8 }}>
                                            Applicant Selection
                                        </div>

                                        {!manualEntry ? (
                                            <>
                                                <Autocomplete
                                                    options={[
                                                        ...(isDev ? TEST_APPLICANTS : TEST_APPLICANTS.map(t => ({ ...t, isTestApplicant: true }))),
                                                        ...applicantList,
                                                        ...memberList,
                                                    ]}
                                                    loading={membersLoading}
                                                    value={selectedMember}
                                                    groupBy={o => o.optionGroup}
                                                    onChange={(_, val) => {
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
                                                            <div style={{ padding: '6px 12px 4px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: params.group === 'Applicants' ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)', background: params.group === 'Applicants' ? 'rgba(219,0,29,0.04)' : 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace' }}>
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
                                                                        {option.username && <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>@{option.username}</span>}
                                                                        {option.isTestApplicant && <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--amber)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', flexShrink: 0 }}>TEST</span>}
                                                                        {option.optionGroup === 'Applicants' && !option.isTestApplicant && <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.7)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', padding: '1px 5px', flexShrink: 0 }}>APPLICANT</span>}
                                                                        {option.hasJoinData && <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#00c364', background: 'rgba(0,195,100,0.08)', border: '1px solid rgba(0,195,100,0.3)', padding: '1px 5px', flexShrink: 0 }}>JOIN</span>}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', marginTop: 1 }}>{option.id}</div>
                                                                </div>
                                                                {option.inGameName && <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>{option.inGameName}</span>}
                                                                {option.isSkeleton && <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 5px', flexShrink: 0 }}>CSV</span>}
                                                                {option.discharged && <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--amber)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', flexShrink: 0 }}>DISCHARGED</span>}
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
                                                        <div {...props as React.HTMLAttributes<HTMLDivElement>} style={{ background: '#1a1a1a', border: '1px solid var(--line-2)', borderRadius: 0, marginTop: 2 }}>
                                                            {children}
                                                        </div>
                                                    )}
                                                />
                                                {selectedMember?.optionGroup === 'Applicants' && selectedMember.hasJoinData && (
                                                    <div style={{ fontSize: '0.72rem', color: '#00c364', padding: '8px 12px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                                        <CheckCircle style={{ fontSize: 14, flexShrink: 0 }} />
                                                        Application data pre-filled — review each step and confirm details with the applicant.
                                                    </div>
                                                )}
                                                {selectedMember?.optionGroup === 'Applicants' && !selectedMember.hasJoinData && (
                                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                                                        No join application — enter all details manually through each step.
                                                    </div>
                                                )}
                                                <button type='button' onClick={() => setManualEntry(true)} style={{ alignSelf: 'flex-start', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 6 }}>
                                                    Can&apos;t find them? Enter manually
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                                    <TextField label='Discord Username' placeholder='e.g. username' value={fields.discordUsername} onChange={set('discordUsername')} required fullWidth sx={inputSx} />
                                                    <TextField label='Discord ID' placeholder='17–18 digit user ID' value={fields.discordId} onChange={set('discordId')} required fullWidth sx={inputSx} helperText='Right-click their name in Discord → Copy User ID' FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }} />
                                                </div>
                                                <button type='button' onClick={() => { setManualEntry(false); setFields(prev => ({ ...prev, discordUsername: '', discordId: '' })) }} style={{ alignSelf: 'flex-start', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 6 }}>
                                                    ← Back to member list
                                                </button>
                                            </>
                                        )}

                                        {returningStatus === 'active' && (
                                            <div style={{ padding: '10px 14px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '3px solid #db001d', fontSize: '0.78rem', color: 'var(--red)', lineHeight: 1.5, marginTop: 8 }}>
                                                <strong>{returningName}</strong> is already an active member. Are you sure you want to log a new recruit record for them?
                                            </div>
                                        )}
                                        {returningStatus === 'discharged' && (
                                            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '3px solid #f59e0b', fontSize: '0.78rem', color: 'var(--amber)', lineHeight: 1.5, marginTop: 8 }}>
                                                <strong>{returningName}</strong> is a returning member (previously discharged). Review their record before proceeding.
                                            </div>
                                        )}

                                        {/* Under-16 warning */}
                                        {fields.age && Number(fields.age) > 0 && Number(fields.age) <= 16 && (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.4)', borderLeft: '3px solid #f59e0b', marginTop: 8 }}>
                                                <Warning style={{ fontSize: 16, color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                                                <div style={{ fontSize: '0.78rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                                                    <strong>Age warning:</strong> This applicant&apos;s application indicates they may be under 16.
                                                    Confirm their age before starting. If they are under 16 and have not been vouched for by a current member,
                                                    they cannot continue. Thank them for their interest and advise them to reapply when eligible or once vouched for.
                                                </div>
                                            </div>
                                        )}

                                        {/* Checklist: Applicant confirmed — separated with border to prevent overlap */}
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14, marginTop: 14 }}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox size='small' checked={interviewChecklist.applicantConfirmed}
                                                        onChange={e => setInterviewChecklist(prev => ({ ...prev, applicantConfirmed: e.target.checked }))}
                                                        sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                    />
                                                }
                                                label={<span style={{ fontSize: '0.8rem', color: interviewChecklist.applicantConfirmed ? '#00c364' : 'rgba(237,237,237,0.65)' }}>Applicant selected and confirmed</span>}
                                            />
                                        </div>
                                    </div>

                                    {/* ── Section B: TeamSpeak Setup ── */}
                                    <div style={{ paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 8 }}>
                                            TeamSpeak Setup
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 10, lineHeight: 1.55 }}>
                                            TeamSpeak 3 is required. Send the address below and assist the applicant with installation if needed.
                                        </div>

                                        {/* TS Address */}
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 8 }}>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '9px 12px', fontSize: '0.82rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.7)', letterSpacing: '0.04em' }}>
                                                {ASOT_TS_ADDRESS}
                                            </div>
                                            <button type='button' onClick={copyTsAddress}
                                                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', background: tsCopied ? 'rgba(0,195,100,0.12)' : 'rgba(255,255,255,0.04)', border: tsCopied ? '1px solid rgba(0,195,100,0.35)' : '1px solid rgba(219,0,29,0.25)', color: tsCopied ? '#00c364' : 'rgba(237,237,237,0.6)', cursor: 'pointer', transition: 'all 0.12s' }}
                                            >
                                                {tsCopied ? <><CheckCircle style={{ fontSize: 14 }} /> COPIED</> : <><ContentCopy style={{ fontSize: 14 }} /> COPY</>}
                                            </button>
                                        </div>

                                        {/* TS3 download link — collapsible */}
                                        <div style={{ marginBottom: 10 }}>
                                            <button type='button' onClick={() => setTs3LinkOpen(v => !v)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'rgba(219,0,29,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
                                            >
                                                {ts3LinkOpen ? <ExpandLess style={{ fontSize: 13 }} /> : <ExpandMore style={{ fontSize: 13 }} />}
                                                {ts3LinkOpen ? 'Hide TeamSpeak 3 download link' : 'Show TeamSpeak 3 download link'}
                                            </button>
                                            {ts3LinkOpen && (
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 8 }}>
                                                    <a href={TS3_DOWNLOAD} target='_blank' rel='noopener noreferrer'
                                                        style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '7px 12px', fontSize: '0.72rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(219,0,29,0.65)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gap: 6 }}
                                                    >
                                                        <Launch style={{ fontSize: 12, flexShrink: 0 }} />
                                                        {TS3_DOWNLOAD}
                                                    </a>
                                                    <button type='button' onClick={copyTs3Link}
                                                        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', background: ts3Copied ? 'rgba(0,195,100,0.12)' : 'rgba(255,255,255,0.04)', border: ts3Copied ? '1px solid rgba(0,195,100,0.35)' : '1px solid rgba(255,255,255,0.08)', color: ts3Copied ? '#00c364' : 'rgba(237,237,237,0.5)', cursor: 'pointer' }}
                                                    >
                                                        {ts3Copied ? <><CheckCircle style={{ fontSize: 12 }} /> COPIED</> : <><ContentCopy style={{ fontSize: 12 }} /> COPY</>}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Inline checklist items */}
                                        <FormGroup sx={{ gap: 0.5 }}>
                                            {([
                                                ['sentTsAddress', 'Applicant has been sent the TeamSpeak address'],
                                                ['installedTs',   'Applicant has installed TeamSpeak 3'],
                                                ['joinedTs',      'Applicant has joined the ASOT TeamSpeak server'],
                                                ['audioConfirmed','Applicant microphone and audio confirmed working'],
                                            ] as const).map(([key, label]) => (
                                                <FormControlLabel key={key}
                                                    control={
                                                        <Checkbox size='small' checked={interviewChecklist[key]}
                                                            onChange={e => setInterviewChecklist(prev => ({ ...prev, [key]: e.target.checked }))}
                                                            sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                        />
                                                    }
                                                    label={<span style={{ fontSize: '0.8rem', color: interviewChecklist[key] ? '#00c364' : 'rgba(237,237,237,0.65)' }}>{label}</span>}
                                                />
                                            ))}
                                        </FormGroup>
                                    </div>

                                    {/* ── Section C: Follow-Along Link ── */}
                                    <div style={{ paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 8 }}>
                                            Applicant Follow-Along Link
                                        </div>
                                        {!sessionId ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.55 }}>
                                                    Generate a unique link for the applicant. They can follow your progress live and raise their hand if they have a question.
                                                </div>
                                                <button type='button' onClick={createSession} disabled={sessionCreating}
                                                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.7)', cursor: sessionCreating ? 'default' : 'pointer', opacity: sessionCreating ? 0.6 : 1 }}
                                                >
                                                    {sessionCreating ? <><CircularProgress size={12} style={{ color: 'inherit' }} /> GENERATING…</> : <><Launch style={{ fontSize: 14 }} /> GENERATE APPLICANT LINK</>}
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: '0.72rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {sessionUrl}
                                                    </div>
                                                    <button type='button' onClick={copySessionLink}
                                                        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', background: sessionLinkCopied ? 'rgba(0,195,100,0.12)' : 'rgba(255,255,255,0.04)', border: sessionLinkCopied ? '1px solid rgba(0,195,100,0.35)' : '1px solid rgba(219,0,29,0.25)', color: sessionLinkCopied ? '#00c364' : 'rgba(237,237,237,0.6)', cursor: 'pointer' }}
                                                    >
                                                        {sessionLinkCopied ? <><CheckCircle style={{ fontSize: 13 }} /> COPIED</> : <><ContentCopy style={{ fontSize: 13 }} /> COPY</>}
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: applicantConnected ? '#00c364' : 'rgba(237,237,237,0.3)' }}>
                                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: applicantConnected ? '#00c364' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                                    {applicantConnected ? 'Applicant connected' : applicantLastActive ? `Disconnected — last active ${formatLastActive(applicantLastActive)}` : 'Waiting for applicant…'}
                                                </div>
                                                {raisedHand && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)' }}>
                                                        <PanTool style={{ fontSize: 14, color: 'var(--amber)' }} />
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 700, flex: 1 }}>Applicant has a question</span>
                                                        <button type='button' onClick={clearRaisedHand} style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(237,237,237,0.5)', background: 'none', border: '1px solid rgba(237,237,237,0.15)', padding: '3px 8px', cursor: 'pointer' }}>CLEAR</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Checklist: follow-along sent */}
                                        <FormControlLabel
                                            style={{ marginTop: 10 }}
                                            control={
                                                <Checkbox size='small' checked={interviewChecklist.sentFollowAlong}
                                                    onChange={e => setInterviewChecklist(prev => ({ ...prev, sentFollowAlong: e.target.checked }))}
                                                    sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                />
                                            }
                                            label={<span style={{ fontSize: '0.8rem', color: interviewChecklist.sentFollowAlong ? '#00c364' : 'rgba(237,237,237,0.65)' }}>Applicant has been sent the follow-along link</span>}
                                        />
                                    </div>

                                    {/* ── Troubleshooting (collapsible) ── */}
                                    <div>
                                        <button type='button' onClick={() => setTsSetupOpen(v => !v)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.45)', textAlign: 'left' }}
                                        >
                                            {tsSetupOpen ? <ExpandLess style={{ fontSize: 16 }} /> : <ExpandMore style={{ fontSize: 16 }} />}
                                            TEAMSPEAK SETUP TROUBLESHOOTING
                                        </button>
                                        {tsSetupOpen && (
                                            <div style={{ padding: '16px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                                                <TroubleshootItem issue='Applicant has installed TeamSpeak 5 instead of TeamSpeak 3.'
                                                    fixes={['Confirm which TeamSpeak version they installed.', 'Ask them to install TeamSpeak 3.', 'TeamSpeak 3 is required for ASOT use.', 'Once installed, have them retry joining the server.']}
                                                />
                                                <TroubleshootItem issue='Applicant cannot find AppData or TeamSpeak folders.'
                                                    fixes={['Explain that AppData may be hidden.', 'In File Explorer, select View and enable Hidden Items.', 'Note that the exact wording may differ slightly depending on Windows version.']}
                                                />
                                                <TroubleshootItem issue='TeamSpeak will not open properly or behaves strangely after install.'
                                                    fixes={['Close TeamSpeak fully.', 'Restart TeamSpeak.', 'If issues continue, restart the computer.', 'Run TeamSpeak as Administrator if required.']}
                                                />
                                                <TroubleshootItem issue='Applicant cannot connect to the ASOT server.'
                                                    fixes={['Confirm the server address was copied correctly.', 'Confirm there are no extra spaces before or after the address.', 'Confirm they are using TeamSpeak 3.', 'Ask them to retry connecting.', 'If required, have them add the server as a bookmark and reconnect from bookmarks.']}
                                                />
                                                <TroubleshootItem issue='Applicant audio or microphone is not working.'
                                                    fixes={['Have them check TeamSpeak capture/playback settings.', 'Confirm the correct microphone is selected.', 'Confirm the correct speakers or headset are selected.', 'Have them test voice activation or push-to-talk.', 'Ask them to reconnect if audio does not update.']}
                                                />
                                                <TroubleshootItem issue='Applicant cannot hear recruiter.'
                                                    fixes={['Confirm headset or speaker device.', 'Check TeamSpeak playback profile.', 'Check Windows default sound output.', 'Have them disconnect and reconnect if needed.']}
                                                />
                                                <TroubleshootItem issue='Recruiter cannot hear applicant.'
                                                    fixes={['Confirm microphone device.', 'Check TeamSpeak capture profile.', 'Confirm push-to-talk key if enabled.', 'Confirm Windows microphone permissions.', 'Have them test using TeamSpeak\'s capture test.']}
                                                />
                                                <TroubleshootItem issue='Applicant and recruiter cannot hear each other.'
                                                    fixes={['Check that neither user is locally muted in TeamSpeak.', 'Ask each person to right-click the other person\'s name in TeamSpeak.', 'Confirm "Mute Client" is not enabled for either user.', 'Confirm microphone and speakers/headset are selected correctly for both users.', 'Check capture/playback settings.', 'Have both users disconnect and reconnect if required.']}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 2: Introduction ── */}
                            {step === 2 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 2 — Introduction', 'Complete each section of the introduction with the applicant before advancing.')}
                                    <div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 10 }}>
                                            Introduction Checklist
                                        </div>
                                        <FormGroup sx={{ gap: 0.5 }}>
                                            {([
                                                ['warmWelcome', 'Warm welcome completed'],
                                                ['processExplained', 'Interview process explained'],
                                                ['backgroundExplained', 'ASOT background explained'],
                                                ['valuesExplained', 'ASOT core values and operating principles explained'],
                                            ] as const).map(([key, label]) => (
                                                <FormControlLabel key={key}
                                                    control={
                                                        <Checkbox
                                                            size='small'
                                                            checked={introChecklist[key]}
                                                            onChange={e => setIntroChecklist(prev => ({ ...prev, [key]: e.target.checked }))}
                                                            sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                        />
                                                    }
                                                    label={<span style={{ fontSize: '0.8rem', color: introChecklist[key] ? '#00c364' : 'rgba(237,237,237,0.65)' }}>{label}</span>}
                                                />
                                            ))}
                                        </FormGroup>
                                    </div>
                                    {nav()}
                                </div>
                            )}


                            {/* ── Step 3: Steam ── */}
                            {step === 3 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 3 — Steam Account', 'A Steam account is required. Paste their profile URL and click Resolve.')}
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
                                                style={{ flexShrink: 0, alignSelf: 'stretch', padding: '0 14px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.6)', cursor: 'pointer', opacity: !fields.steamUrl.trim() ? 0.4 : 1 }}
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
                                        {steamStatus === 'error' && <div style={{ fontSize: '0.72rem', color: 'var(--red)' }}>{steamError}</div>}
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

                            {/* ── Step 4: Identity ── */}
                            {step === 4 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 4 — Joining Name', "The recruit's in-unit identity. Must be unique — max 12 characters.")}
                                    <TextField
                                        label='Joining Name'
                                        placeholder='e.g. Thomas, Six, Yoshi'
                                        value={fields.joiningName}
                                        onChange={set('joiningName')}
                                        required fullWidth
                                        inputProps={{ maxLength: 12 }}
                                        helperText={nameOffensive ? 'This name may not be appropriate.' : nameHelperText}
                                        FormHelperTextProps={{ style: { color: nameOffensive ? 'var(--amber)' : nameColor, fontSize: '0.75rem', marginTop: 4 } }}
                                        InputProps={{
                                            endAdornment: nameStatus === 'checking'
                                                ? <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                                                : nameStatus === 'available' && !nameOffensive ? <CheckCircle style={{ fontSize: 16, color: '#00c364' }} />
                                                : nameStatus === 'taken' || nameOffensive ? <Warning style={{ fontSize: 16, color: nameOffensive ? 'var(--amber)' : '#db001d' }} />
                                                : undefined,
                                        }}
                                        sx={{
                                            ...inputSx,
                                            ...(nameStatus === 'available' && !nameOffensive && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(0,195,100,0.5)' } }),
                                            ...(nameStatus === 'taken' && { '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(219,0,29,0.7)' } }),
                                        }}
                                    />
                                    {nameSimilar.length > 0 && nameStatus !== 'taken' && (
                                        <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--amber)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderLeft: '3px solid #f59e0b', lineHeight: 1.6 }}>
                                            Similar name{nameSimilar.length > 1 ? 's' : ''} already in the unit: <strong>{nameSimilar.join(', ')}</strong>. Confirm this is intentional.
                                        </div>
                                    )}
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 5: Background ── */}
                            {step === 5 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 5 — Background', "The recruit's age, location, experience, and milsim history.")}

                                    {selectedMember?.hasJoinData && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)', fontSize: '0.72rem', color: '#00c364' }}>
                                            <CheckCircle style={{ fontSize: 14, flexShrink: 0 }} />
                                            Application data pre-filled — review and confirm each section with the applicant.
                                        </div>
                                    )}
                                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                        <TextField
                                            label='Age' placeholder='e.g. 22' type='number'
                                            value={fields.age} onChange={set('age')}
                                            required inputProps={{ min: 13, max: 100 }} sx={doneSx(bgChecklist.ageConfirmed)} fullWidth
                                        />
                                        <FormControl required sx={doneSx(bgChecklist.regionDiscussed)} fullWidth>
                                            <InputLabel>Region</InputLabel>
                                            <Select value={fields.region} label='Region' onChange={e => setFields(prev => ({ ...prev, region: e.target.value, regionCustom: '' }))}>
                                                {REGIONS.map(r => <MenuItem key={r} value={r} style={{ fontSize: '0.85rem' }}>{r}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                        <TextField
                                            label='ARMA 3 Hours' placeholder='e.g. 500'
                                            value={fields.armaHours} onChange={set('armaHours')}
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
                                            FormHelperTextProps={{ style: { color: 'var(--amber)', fontSize: '0.7rem', marginTop: 3 } }}
                                            sx={doneSx(bgChecklist.armaOwnershipConfirmed)} fullWidth
                                        />
                                        <FormControl sx={doneSx(bgChecklist.armaOwnershipConfirmed)} fullWidth>
                                            <InputLabel>Owns ARMA 3?</InputLabel>
                                            <Select value={fields.ownsArma ? 'yes' : 'no'} label='Owns ARMA 3?' onChange={e => { setOwnsArmaTouched(true); setFields(prev => ({ ...prev, ownsArma: e.target.value === 'yes' })) }}>
                                                <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                                <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </div>

                                    {ownsArmaTouched && !fields.ownsArma && (
                                        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', fontSize: '0.78rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                                            <Warning style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />
                                            The applicant will need to purchase ARMA 3 before officially joining. You may continue — this will be flagged for the J1 lead.
                                        </div>
                                    )}
                                    {fields.region === 'Other' && (
                                        <TextField label='Country / Region' placeholder='Enter their country or region' value={fields.regionCustom} onChange={set('regionCustom')} fullWidth sx={inputSx} />
                                    )}
                                    {fields.region && !OCEANIA_ASIA.has(fields.region) && fields.region !== 'Other' && (
                                        <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--amber)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderLeft: '3px solid #f59e0b', lineHeight: 1.5 }}>
                                            <HelpOutline style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 5 }} />
                                            Members outside Oceania/Asia may experience higher latency and timezone differences during ops. Confirm they understand the schedule.
                                        </div>
                                    )}

                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        <FormControl sx={doneSx(bgChecklist.milsimDiscussed)}>
                                            <InputLabel>Prior milsim experience?</InputLabel>
                                            <Select value={fields.priorMilsim ? 'yes' : 'no'} label='Prior milsim experience?' onChange={e => setFields(prev => ({ ...prev, priorMilsim: e.target.value === 'yes' }))}>
                                                <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                                <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <FormControl sx={doneSx(bgChecklist.milsimDiscussed)}>
                                            <InputLabel>Part of another ARMA 3 unit?</InputLabel>
                                            <Select value={fields.dualClan ? 'yes' : 'no'} label='Part of another ARMA 3 unit?' onChange={e => setFields(prev => ({ ...prev, dualClan: e.target.value === 'yes' }))}>
                                                <MenuItem value='yes' style={{ fontSize: '0.85rem' }}>Yes</MenuItem>
                                                <MenuItem value='no' style={{ fontSize: '0.85rem' }}>No</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </div>
                                    {fields.priorMilsim && (
                                        <TextField label='Previous units / groups' placeholder='List any previous milsim units or groups' value={fields.previousUnits} onChange={set('previousUnits')} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} sx={doneSx(bgChecklist.unitsDiscussed)} />
                                    )}
                                    {fields.dualClan && (
                                        <TextField label='Current unit / group' placeholder='List their current group(s)' value={fields.currentUnit} onChange={set('currentUnit')} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} sx={doneSx(bgChecklist.unitsDiscussed)} />
                                    )}

                                    {Number(fields.age) > 0 && Number(fields.age) < 17 && (
                                        <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                <Warning style={{ fontSize: 16, color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--amber)', marginBottom: 3 }}>Applicant is under 17 — age restriction applies</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                                                        To proceed, confirm that this applicant is vouched for by a current member, or that you are requesting an exemption. Name the vouching member or state the reason below.
                                                    </div>
                                                </div>
                                            </div>
                                            <TextField
                                                label='Vouch / Exemption Note'
                                                placeholder='e.g. "Vouched for by Cpl. Smith" or "Requesting exemption — mature applicant with prior milsim leadership experience"'
                                                value={fields.ageExemptionNote} onChange={set('ageExemptionNote')}
                                                required fullWidth multiline minRows={2}
                                                inputProps={{ maxLength: 500 }}
                                                helperText={`${fields.ageExemptionNote.length} / 500`}
                                                FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                                                sx={{ ...inputSx, '& .MuiOutlinedInput-root fieldset': { borderColor: 'rgba(245,158,11,0.4)' }, '& .MuiOutlinedInput-root:hover fieldset': { borderColor: 'rgba(245,158,11,0.6)' }, '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: 'var(--amber)' }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--amber)' } }}
                                            />
                                        </div>
                                    )}

                                    <TextField
                                        label='Experience / About the Recruit'
                                        placeholder='Prior military or gaming background, reason for joining, anything relevant...'
                                        value={fields.experience} onChange={set('experience')}
                                        multiline minRows={3} fullWidth
                                        inputProps={{ maxLength: 2000 }}
                                        helperText={fields.experience ? `${fields.experience.length} / 2000` : undefined}
                                        FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                                        sx={inputSx}
                                    />

                                    <div>
                                        <TextField
                                            label='Recruiter Notes'
                                            placeholder='Record anything you want J1 to know about this applicant...'
                                            value={fields.notes} onChange={set('notes')}
                                            multiline minRows={2} fullWidth
                                            inputProps={{ maxLength: 1000 }}
                                            helperText={fields.notes ? `${fields.notes.length} / 1000` : undefined}
                                            FormHelperTextProps={{ style: { fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 } }}
                                            sx={inputSx}
                                        />
                                        <div style={{ fontSize: '0.68rem', color: 'var(--amber)', marginTop: 5, fontWeight: 600, letterSpacing: '0.04em' }}>
                                            ⚠ Applicant cannot see these notes.
                                        </div>
                                    </div>

                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 6: Availability ── */}
                            {step === 6 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 6 — Availability', 'Ops run Saturday and Sunday nights. Platoon 1 on Saturdays, Platoon 2 on Sundays.')}
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        <FormControl required sx={doneSx(availChecklist.operationalNightsConfirmed)}>
                                            <InputLabel>Available operation nights</InputLabel>
                                            <Select value={fields.availableNights} label='Available operation nights' onChange={e => setFields(prev => ({ ...prev, availableNights: e.target.value }))}>
                                                {NIGHTS.map(n => <MenuItem key={n} value={n} style={{ fontSize: '0.85rem' }}>{n}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                        <FormControl required sx={doneSx(availChecklist.operationalNightsConfirmed)}>
                                            <InputLabel>Operations per month (approx.)</InputLabel>
                                            <Select value={fields.opsPerMonth} label='Operations per month (approx.)' onChange={e => setFields(prev => ({ ...prev, opsPerMonth: e.target.value }))}>
                                                {OPS_PER_MONTH.map(o => <MenuItem key={o} value={o} style={{ fontSize: '0.85rem' }}>{o}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </div>
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 7: Roles ── */}
                            {step === 7 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Step 7 — Role Interest', "The recruit's preferred role and any department interest.")}
                                    <FormControl required sx={doneSx(rolesChecklist.primaryRoleDiscussed)} fullWidth>
                                        <InputLabel>Primary role</InputLabel>
                                        <Select value={fields.primaryRole} label='Primary role' onChange={e => setFields(prev => ({ ...prev, primaryRole: e.target.value }))}>
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

                            {/* ── Step 8: Basic Combat Trainings ── */}
                            {step === 8 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 2 — Step 8: Basic Combat Trainings', 'Explain the BCT process. Complete guide sections on the right.')}

                                    {/* BCT quiz toggle */}
                                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 8 }}>BCT1 Confirmation Quiz</div>
                                        <FormControlLabel
                                            control={
                                                <Checkbox size='small' checked={bctQuizRequested}
                                                    onChange={e => setBctQuizRequested(e.target.checked)}
                                                    sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                />
                                            }
                                            label={<span style={{ fontSize: '0.8rem', color: bctQuizRequested ? '#00c364' : 'rgba(237,237,237,0.65)' }}>
                                                Applicant has requested BCT1 confirmation quiz instead of standard course
                                            </span>}
                                        />
                                        {bctQuizRequested && (
                                            <div style={{ marginTop: 8, padding: '7px 10px', background: 'rgba(0,195,100,0.05)', border: '1px solid rgba(0,195,100,0.2)', fontSize: '0.72rem', color: 'rgba(0,195,100,0.8)', lineHeight: 1.5 }}>
                                                Mark this applicant for BCT1 quiz. A J3 member must conduct and approve the quiz.
                                            </div>
                                        )}
                                    </div>
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 9: BCT Availability ── */}
                            {step === 9 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 2 — Step 9: BCT Availability', 'Click days on the calendar to record Morning / Afternoon / Evening availability for BCT Stage 1.')}

                                    <div ref={calendarRef}>
                                        <BCTAvailabilityCalendar
                                            applicantId={selectedMember?.id ?? fields.discordId}
                                            applicantName={fields.joiningName || fields.discordUsername || 'Applicant'}
                                            recruiterName={displayName}
                                            isQuiz={bctQuizRequested}
                                            onSlotCreated={(slot: BCTSlotSummary) => {
                                                if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
                                                    sessionWsRef.current.send(JSON.stringify({ type: 'bct-slot-added', slot }))
                                                }
                                            }}
                                        />
                                    </div>

                                    <FormControlLabel
                                        control={
                                            <Checkbox size='small' checked={bctCalendarChecklist.availabilityRecorded}
                                                onChange={e => setBctCalendarChecklist(p => ({ ...p, availabilityRecorded: e.target.checked }))}
                                                sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                            />
                                        }
                                        label={<span style={{ fontSize: '0.8rem', color: bctCalendarChecklist.availabilityRecorded ? '#00c364' : 'rgba(237,237,237,0.65)' }}>
                                            Applicant availability recorded
                                        </span>}
                                    />
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 10: ORBAT Overview ── */}
                            {step === 10 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 2 — Step 10: ORBAT Overview', 'Explain unit structure, platoons, attendance, and LOA policy.')}

                                    <OrbatOnboarding highlight={orbatHighlight} />
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.6 }}>
                                        Tick each platoon in the right guide panel as you explain it. The diagram highlights live on the applicant&apos;s page.
                                    </div>
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 11: Rules & Expectations (informational) ── */}
                            {step === 11 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 3 — Step 11: Rules & Expectations', 'Read the community rules to the applicant. Tick complete once all rules have been covered.')}

                                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 10, lineHeight: 1.6 }}>
                                            Read each rule to the applicant and answer any questions. The following step will ask the applicant to individually confirm each rule.
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {[
                                                'Maintain a serious attitude during operations',
                                                'Follow the chain of command',
                                                'Treat all members with respect',
                                                'Do not spread rumours or malicious comments',
                                                'Represent ASOT positively in other communities',
                                                'No dual-clanning MILSIM groups',
                                                'Keep communication transparent — no going AWOL',
                                                'No meta-gaming or spoiling operations',
                                            ].map((r, i) => (
                                                <li key={i} style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.5 }}>{r}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <FormControlLabel
                                        control={
                                            <Checkbox size='small' checked={rulesIntroCompleted}
                                                onChange={e => setRulesIntroCompleted(e.target.checked)}
                                                sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                            />
                                        }
                                        label={<span style={{ fontSize: '0.8rem', color: rulesIntroCompleted ? '#00c364' : 'rgba(237,237,237,0.65)' }}>
                                            Rules overview complete — applicant has been informed of all community rules
                                        </span>}
                                    />
                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 12: Joining Agreement ── */}
                            {step === 12 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 3 — Step 12: Joining Agreement', 'Read each question. Applicant answers YES or NO on their live page. Tick off once answered.')}

                                    {/* Applicant answers warning banner */}
                                    {/* Wrong answer warning */}
                                    {Object.entries(rulesAnswers).some(([i, ans]) => ans !== null && ans !== undefined && ans !== RULES_QUESTIONS[Number(i)]?.correct) && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderLeft: '3px solid #f59e0b' }}>
                                            <Warning style={{ fontSize: 16, color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                                            <div style={{ fontSize: '0.78rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                                                <strong>One or more answers require follow-up.</strong> The Continue button is locked until all answers are correct.
                                                {RULES_QUESTIONS.map((q, i) => {
                                                    const ans = rulesAnswers[i]
                                                    const isWrong = ans !== null && ans !== undefined && ans !== q.correct
                                                    return isWrong ? <div key={i} style={{ marginTop: 4, fontSize: '0.72rem' }}>Q{i + 1}: {q.recruiterNote}</div> : null
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Current question — full recruiter view */}
                                    {(() => {
                                        const q = RULES_QUESTIONS[rulesCurrentQuestion]
                                        const ans = rulesAnswers[rulesCurrentQuestion]
                                        const isWrong = ans !== null && ans !== undefined && ans !== q.correct
                                        return (
                                            <div style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(219,0,29,0.4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {/* Header row */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                                                        Question {rulesCurrentQuestion + 1} of {RULES_QUESTIONS.length}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button type='button'
                                                            onClick={() => setRulesCurrentQuestion(q => Math.max(0, q - 1))}
                                                            disabled={rulesCurrentQuestion === 0}
                                                            style={{ padding: '4px 10px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', cursor: rulesCurrentQuestion === 0 ? 'default' : 'pointer', opacity: rulesCurrentQuestion === 0 ? 0.3 : 1 }}
                                                        >← PREV</button>
                                                        <button type='button'
                                                            onClick={() => setRulesCurrentQuestion(q => Math.min(RULES_QUESTIONS.length - 1, q + 1))}
                                                            disabled={rulesCurrentQuestion === RULES_QUESTIONS.length - 1}
                                                            style={{ padding: '4px 10px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', cursor: rulesCurrentQuestion === RULES_QUESTIONS.length - 1 ? 'default' : 'pointer', opacity: rulesCurrentQuestion === RULES_QUESTIONS.length - 1 ? 0.3 : 1 }}
                                                        >NEXT →</button>
                                                    </div>
                                                </div>

                                                {/* Question */}
                                                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', lineHeight: 1.55 }}>{q.question}</div>

                                                {/* Full explanation */}
                                                <div style={{ padding: '10px 13px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.12)', borderLeft: '2px solid rgba(219,0,29,0.4)', fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.7 }}>
                                                    {q.fullExplanation}
                                                </div>

                                                {/* Expected answer tag */}
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: q.correct ? 'rgba(0,195,100,0.75)' : 'rgba(219,0,29,0.65)', letterSpacing: '0.06em' }}>
                                                    Expected: {q.correct ? 'YES' : 'NO'}
                                                </div>

                                                {/* Applicant answer status */}
                                                {ans !== null && ans !== undefined && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: isWrong ? 'rgba(245,158,11,0.08)' : 'rgba(0,195,100,0.05)', border: isWrong ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(0,195,100,0.2)' }}>
                                                        {isWrong ? <Warning style={{ fontSize: 15, color: 'var(--amber)' }} /> : <CheckCircle style={{ fontSize: 15, color: '#00c364' }} />}
                                                        <span style={{ fontSize: '0.75rem', color: isWrong ? 'var(--amber)' : '#00c364', fontWeight: 600 }}>
                                                            Applicant answered {ans ? 'YES' : 'NO'}
                                                            {isWrong && ' — clarify the rule and ask them to reconsider before continuing'}
                                                        </span>
                                                    </div>
                                                )}
                                                {(ans === null || ans === undefined) && (
                                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                                                        Awaiting applicant answer…
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {/* Progress indicators */}
                                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {RULES_QUESTIONS.map((q, i) => {
                                            const ans = rulesAnswers[i]
                                            const isWrong = ans !== null && ans !== undefined && ans !== q.correct
                                            const isCorrect = ans !== null && ans !== undefined && !isWrong
                                            return (
                                                <button key={i} type='button' onClick={() => setRulesCurrentQuestion(i)}
                                                    style={{ width: i === rulesCurrentQuestion ? 24 : 14, height: 8, borderRadius: 4, background: isCorrect ? '#00c364' : isWrong ? 'var(--amber)' : i === rulesCurrentQuestion ? 'rgba(219,0,29,0.8)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', transition: 'all 0.2s', padding: 0 }}
                                                />
                                            )
                                        })}
                                    </div>

                                    {nav()}
                                </div>
                            )}

                            {/* ── Step 13: Join Decision ── */}
                            {step === 13 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 4 — Step 13: Join Decision', 'Ask final questions and record the applicant\'s decision.')}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Applicant&apos;s decision:</div>
                                        {([
                                            { val: 'yes' as const, label: 'YES — Continue to Admin onboarding', color: '#00c364', bg: 'rgba(0,195,100,0.08)', border: 'rgba(0,195,100,0.4)' },
                                            { val: 'no' as const, label: 'NO — Close application for J1 review', color: 'var(--red)', bg: 'rgba(219,0,29,0.08)', border: 'rgba(219,0,29,0.4)' },
                                            { val: 'pending' as const, label: 'PENDING — Set chase-up date', color: 'var(--amber)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.4)' },
                                        ] as const).map(({ val, label, color, bg, border }) => (
                                            <button key={val} type='button' onClick={() => setJoinDecision(val)}
                                                style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left', background: joinDecision === val ? bg : 'rgba(255,255,255,0.02)', border: `1px solid ${joinDecision === val ? border : 'rgba(255,255,255,0.07)'}`, color: joinDecision === val ? color : 'rgba(237,237,237,0.55)', cursor: 'pointer', transition: 'all 0.12s' }}
                                            >{label}</button>
                                        ))}
                                    </div>

                                    {joinDecision === 'no' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '3px solid var(--red)' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 }}>Application will be closed and submitted for J1 lead review.</div>
                                            <TextField
                                                label='Reason / Notes'
                                                placeholder='Reason for declining — applicant did not wish to continue, concerns raised, etc.'
                                                value={joinDecisionReason}
                                                onChange={e => setJoinDecisionReason(e.target.value)}
                                                multiline minRows={2} fullWidth
                                                inputProps={{ maxLength: 500 }}
                                                sx={inputSx}
                                            />
                                        </div>
                                    )}

                                    {joinDecision === 'pending' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '3px solid #f59e0b' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 700 }}>All fields required before submitting as pending.</div>
                                            <TextField
                                                label='Reason for pending (required)'
                                                placeholder='e.g. Applicant needs more time to decide, does not yet own Arma 3…'
                                                value={joinDecisionReason}
                                                onChange={e => setJoinDecisionReason(e.target.value)}
                                                multiline minRows={2} fullWidth required
                                                error={!joinDecisionReason.trim()}
                                                inputProps={{ maxLength: 500 }}
                                                sx={inputSx}
                                            />
                                            <TextField
                                                type='datetime-local'
                                                label='Chase-up Date & Time (required)'
                                                value={joinPendingDate}
                                                onChange={e => setJoinPendingDate(e.target.value)}
                                                fullWidth required error={!joinPendingDate}
                                                InputLabelProps={{ shrink: true }}
                                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.85rem', '& fieldset': { borderColor: !joinPendingDate ? 'rgba(219,0,29,0.6)' : 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' } }}
                                            />
                                        </div>
                                    )}

                                    {/* Navigation — only YES advances to step 13 */}
                                    <div style={{ display: 'flex', justifyContent: joinDecision ? 'space-between' : 'flex-start', marginTop: 8 }}>
                                        <Button type='button' onClick={() => setStep(s => s - 1)} startIcon={<ArrowBack />}
                                            sx={{ borderRadius: 0, color: 'rgba(237,237,237,0.5)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', padding: '7px 18px', '&:hover': { background: 'rgba(255,255,255,0.04)' } }}
                                        >BACK</Button>

                                        {joinDecision === 'yes' && (
                                            <Button type='button' onClick={() => setStep(14)} endIcon={<ArrowForward />} variant='contained'
                                                sx={{ borderRadius: 0, background: '#00c364', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.78rem', padding: '7px 18px', '&:hover': { background: '#00a855' } }}
                                            >CONTINUE TO ADMIN</Button>
                                        )}
                                        {joinDecision === 'no' && (
                                            <Button type='button' onClick={async () => {
                                                setLoading(true)
                                                try {
                                                    await fetch('/api/admin/j1/applications', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ ...fields, isDirectRecruit: true, applicantDeclined: true, declineReason: joinDecisionReason }),
                                                    })
                                                    fetch('/api/admin/j1/in-progress', { method: 'DELETE' }).catch(() => {})
                                                    setHasDraft(false)
                                                    setSuccess('declined')
                                                } catch { setError('Network error.') } finally { setLoading(false) }
                                            }}
                                            disabled={loading}
                                            startIcon={loading ? <CircularProgress size={14} color='inherit' /> : undefined}
                                            variant='contained'
                                            sx={{ borderRadius: 0, background: 'rgba(219,0,29,0.8)', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.78rem', padding: '7px 18px', '&:hover': { background: 'var(--red)' }, '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.3)' } }}
                                            >{loading ? 'CLOSING…' : 'CLOSE APPLICATION'}</Button>
                                        )}
                                        {joinDecision === 'pending' && (
                                            <Button type='button' onClick={async () => {
                                                if (!joinDecisionReason.trim() || !joinPendingDate) return
                                                setLoading(true)
                                                try {
                                                    const res = await fetch('/api/admin/j1/applications', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ ...fields, isDirectRecruit: true, applicantPending: true, pendingReason: joinDecisionReason }),
                                                    })
                                                    const data = await res.json()
                                                    setPendedApplicationId(String(data.id ?? data._id ?? ''))
                                                    // Create chase-up task
                                                    await fetch('/api/admin/tasks', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            title: `Join decision follow-up — ${fields.discordUsername || fields.discordId}`,
                                                            description: `${joinDecisionReason}\n\nApplication ID: ${data.id ?? data._id ?? ''}`,
                                                            dueDate: joinPendingDate,
                                                            notifyAssignee: true,
                                                        }),
                                                    }).catch(() => {})
                                                    fetch('/api/admin/j1/in-progress', { method: 'DELETE' }).catch(() => {})
                                                    setHasDraft(false)
                                                    setSuccess('pended')
                                                } catch { setError('Network error.') } finally { setLoading(false) }
                                            }}
                                            disabled={loading || !joinDecisionReason.trim() || !joinPendingDate}
                                            startIcon={loading ? <CircularProgress size={14} color='inherit' /> : undefined}
                                            variant='contained'
                                            sx={{ borderRadius: 0, background: 'rgba(245,158,11,0.7)', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.78rem', padding: '7px 18px', '&:hover': { background: 'var(--amber)' }, '&.Mui-disabled': { background: 'rgba(245,158,11,0.2)', color: 'rgba(237,237,237,0.3)' } }}
                                            >{loading ? 'SAVING…' : 'FINALISE PENDING'}</Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Step 14: Admin ── */}
                            {step === 14 && (
                                <div className='flex flex-col gap-4'>
                                    {sectionLabel('Section 4 — Step 14: Admin & Submit', 'Complete onboarding tasks then log the recruit.')}

                                    {/* TeamSpeak onboarding — collapsible, auto-collapses when TFAR confirmed */}
                                    <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', transition: 'all 0.3s' }}>
                                        <button type='button' onClick={() => setTsSectionOpen(v => !v)}
                                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: tsLinkStatus === 'linked' && tsNameConfirmed && tsGroupsConfirmed ? 'rgba(0,195,100,0.05)' : 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', gap: 8 }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {tsLinkStatus === 'linked' && tsNameConfirmed && tsGroupsConfirmed
                                                    ? <span style={{ fontSize: '0.65rem', color: '#00c364' }}>✓</span>
                                                    : <span style={{ width: 8, height: 8, borderRadius: '50%', background: tsLinkStatus === 'linked' ? '#00c364' : tsLinkStatus === 'pending' ? 'var(--amber)' : 'rgba(255,255,255,0.15)', display: 'inline-block', flexShrink: 0 }} />
                                                }
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tsLinkStatus === 'linked' && tsNameConfirmed && tsGroupsConfirmed ? '#00c364' : 'rgba(219,0,29,0.6)' }}>TeamSpeak Account Linking</span>
                                            </div>
                                            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)' }}>{tsSectionOpen ? '[−]' : '[+]'}</span>
                                        </button>
                                        {tsSectionOpen && (
                                        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 8 }}>TeamSpeak Account Linking</div>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 10, lineHeight: 1.5 }}>
                                            The applicant links their own TeamSpeak account via the button on their live page. Monitor the status here.
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: tsLinkStatus === 'linked' ? '#00c364' : tsLinkStatus === 'pending' ? 'var(--amber)' : tsLinkStatus === 'failed' ? 'var(--red)' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            <div style={{ fontSize: '0.72rem', color: tsLinkStatus === 'linked' ? '#00c364' : tsLinkStatus === 'pending' ? 'var(--amber)' : tsLinkStatus === 'failed' ? 'var(--red)' : 'rgba(237,237,237,0.4)' }}>
                                                {tsLinkStatus === 'linked' ? 'TeamSpeak account linked successfully'
                                                    : tsLinkStatus === 'pending' ? 'Applicant is linking their account…'
                                                    : tsLinkStatus === 'failed' ? 'Link failed — ask applicant to retry'
                                                    : 'Awaiting applicant TeamSpeak link'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {(['idle', 'pending', 'linked', 'failed'] as const).map(s => (
                                                <button key={s} type='button' onClick={() => setTsLinkStatus(s)}
                                                    style={{ padding: '5px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: tsLinkStatus === s ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${tsLinkStatus === s ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.08)'}`, color: tsLinkStatus === s ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.35)', cursor: 'pointer' }}
                                                >{s}</button>
                                            ))}
                                        </div>
                                        {tsLinkStatus === 'linked' && (
                                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <button type='button'
                                                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(0,195,100,0.08)', border: '1px solid rgba(0,195,100,0.3)', color: '#00c364', cursor: 'pointer' }}
                                                >
                                                    <Launch style={{ fontSize: 13 }} /> ASSIGN TS SERVER GROUPS & ROLES
                                                </button>
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>
                                                    Groups: REC - Recruit · ASOT · ~~~ Rank ~~~ · ~~~ Unit ~~~ · ~~~ Citations ~~~ · ~~~ Certifications ~~~ · ~~~ Campaign Medals ~~~
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1.5 }}>
                                                    <strong>TS Rename:</strong> Update applicant&apos;s TeamSpeak name to <strong>REC {fields.joiningName || '[Name]'}</strong>. Do this manually in TeamSpeak if auto-rename is not available.
                                                </div>
                                                <FormGroup sx={{ gap: 0.5, marginTop: 0.5 }}>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox size='small' checked={tsNameConfirmed}
                                                                onChange={e => setTsNameConfirmed(e.target.checked)}
                                                                sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                            />
                                                        }
                                                        label={<span style={{ fontSize: '0.78rem', color: tsNameConfirmed ? '#00c364' : 'rgba(237,237,237,0.65)' }}>
                                                            Recruit TeamSpeak name confirmed — REC {fields.joiningName || '[Name]'} applied
                                                        </span>}
                                                    />
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox size='small' checked={tsGroupsConfirmed}
                                                                onChange={e => setTsGroupsConfirmed(e.target.checked)}
                                                                sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                            />
                                                        }
                                                        label={<span style={{ fontSize: '0.78rem', color: tsGroupsConfirmed ? '#00c364' : 'rgba(237,237,237,0.65)' }}>
                                                            TeamSpeak server groups and permissions confirmed
                                                        </span>}
                                                    />
                                                </FormGroup>
                                            </div>
                                        )}
                                        </div>
                                        )}
                                    </div>

                                    {/* TFAR — collapsible, auto-collapses when TFAR confirmed */}
                                    <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                        <button type='button' onClick={() => setTfarSectionOpen(v => !v)}
                                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: tfarConfirmed ? 'rgba(0,195,100,0.05)' : 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', gap: 8 }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {tfarConfirmed
                                                    ? <span style={{ fontSize: '0.65rem', color: '#00c364' }}>✓</span>
                                                    : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'inline-block' }} />
                                                }
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tfarConfirmed ? '#00c364' : 'rgba(219,0,29,0.6)' }}>TFAR Installation</span>
                                            </div>
                                            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)' }}>{tfarSectionOpen ? '[−]' : '[+]'}</span>
                                        </button>
                                        {tfarSectionOpen && (
                                            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 10, lineHeight: 1.55 }}>
                                                    Direct the applicant to click <strong>Download TFAR Plugin</strong> on their follow-along page. The file is served directly from the ASOT website.
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.7, marginBottom: 10 }}>
                                                    <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        <li>Applicant clicks <strong>Download TFAR Plugin</strong> on their page</li>
                                                        <li>Open the downloaded file and click <strong>Install</strong></li>
                                                        <li>Reconnect to TeamSpeak</li>
                                                        <li>Confirm &ldquo;Task Force Radio Status&rdquo; appears when clicking their TS name</li>
                                                        <li>If not visible: Tools → Options → Addons</li>
                                                    </ol>
                                                </div>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox size='small' checked={tfarConfirmed}
                                                            onChange={e => setTfarConfirmed(e.target.checked)}
                                                            sx={{ color: 'rgba(219,0,29,0.4)', '&.Mui-checked': { color: '#00c364' }, padding: '4px 6px' }}
                                                        />
                                                    }
                                                    label={<span style={{ fontSize: '0.8rem', color: tfarConfirmed ? '#00c364' : 'rgba(237,237,237,0.65)' }}>TFAR confirmed installed in TeamSpeak</span>}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Discord Onboarding — given extra top margin to visually separate from TS/TFAR */}
                                    <div style={{ padding: '16px 18px', background: tfarConfirmed ? 'rgba(88,101,242,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${tfarConfirmed ? 'rgba(88,101,242,0.3)' : 'rgba(255,255,255,0.07)'}`, borderTop: tfarConfirmed ? '2px solid rgba(88,101,242,0.5)' : '1px solid rgba(255,255,255,0.07)', marginTop: 4, transition: 'all 0.4s' }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tfarConfirmed ? 'rgba(88,101,242,0.85)' : 'rgba(219,0,29,0.6)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {tfarConfirmed && <span>▶</span>}
                                            Discord Onboarding
                                            {tfarConfirmed && <span style={{ fontSize: '0.55rem', color: 'rgba(88,101,242,0.6)', fontWeight: 600, letterSpacing: '0.1em' }}>— NEXT STEP</span>}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 10, lineHeight: 1.55 }}>
                                            Assign roles, update name, and walk the applicant through key Discord channels.
                                        </div>
                                        {!discordRolesAssigned ? (
                                            <button type='button' onClick={() => setDiscordRolesAssigned(true)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.7)', cursor: 'pointer' }}
                                            >
                                                <Launch style={{ fontSize: 13 }} /> ASSIGN DISCORD ROLES
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#00c364', marginBottom: 6 }}>
                                                <CheckCircle style={{ fontSize: 14 }} /> Discord roles assigned — ASOT Member · Recruit (removed: Welcome · Applicant)
                                            </div>
                                        )}
                                        <div style={{ marginTop: 8, fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', lineHeight: 1.5 }}>
                                            Interactive Discord walkthrough and server channel guide coming in a future update.
                                        </div>
                                    </div>

                                    <FormControl required sx={inputSx}>
                                        <InputLabel>How did they find ASOT?</InputLabel>
                                        <Select value={fields.heardAbout} label='How did they find ASOT?' onChange={e => setFields(prev => ({ ...prev, heardAbout: e.target.value, heardAboutOther: '' }))}>
                                            {HEARD_ABOUT_OPTIONS.map(o => <MenuItem key={o} value={o} style={{ fontSize: '0.85rem' }}>{o}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    {fields.heardAbout === 'Other' && (
                                        <TextField
                                            label='Please specify (required)'
                                            value={fields.heardAboutOther}
                                            onChange={set('heardAboutOther')}
                                            required fullWidth sx={inputSx}
                                            inputProps={{ maxLength: 20 }}
                                            error={!fields.heardAboutOther.trim()}
                                            helperText={
                                                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ color: !fields.heardAboutOther.trim() ? 'var(--red)' : 'transparent' }}>Required</span>
                                                    <span style={{ color: 'rgba(237,237,237,0.3)' }}>{fields.heardAboutOther.length} / 20</span>
                                                </span>
                                            }
                                            FormHelperTextProps={{ component: 'div' as React.ElementType, style: { fontSize: '0.72rem', marginTop: 3 } } as object}
                                        />
                                    )}

                                    <TextField
                                        label='Recruited By'
                                        value={fields.recruiter}
                                        onChange={set('recruiter')}
                                        required fullWidth sx={inputSx}
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

            {/* ── RIGHT COLUMN: Recruitment Process guide ───────────────────────── */}
            <div
                className='xl:w-[40%]'
                style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.14)', overflow: 'hidden', minHeight: '500px' }}
            >
                {/* Sticky header */}
                <div style={{
                    flexShrink: 0,
                    padding: '20px 24px 14px',
                    borderBottom: '1px solid var(--line-2)',
                    background: 'rgba(0,0,0,0.14)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6, fontFamily: 'monospace' }}>
                                {'// RECRUITER GUIDE'}
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                                Recruitment Process
                            </div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginTop: 5 }}>
                                {STEP_LABELS[step - 1]}
                            </div>
                        </div>

                        {/* Live session status indicators + preview button */}
                        {sessionId && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
                                <button
                                    onClick={() => setPreviewOpen(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(237,237,237,0.55)', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em' }}
                                >
                                    <Launch style={{ fontSize: 12 }} />
                                    APPLICANT VIEW
                                </button>
                                {/* Raised hand alert */}
                                {raisedHand && (
                                    <button
                                        onClick={clearRaisedHand}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            padding: '4px 10px', border: '1px solid rgba(245,158,11,0.5)',
                                            background: 'rgba(245,158,11,0.12)', color: 'var(--amber)',
                                            cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                                        }}
                                        title='Click to lower hand'
                                    >
                                        <PanTool style={{ fontSize: 12 }} />
                                        QUESTION — CLICK TO CLEAR
                                    </button>
                                )}
                                {/* Applicant connection status */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', color: applicantConnected ? '#00c364' : 'rgba(237,237,237,0.3)' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: applicantConnected ? '#00c364' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                    {applicantConnected ? 'Applicant Active' : applicantLastActive ? `Last active: ${formatLastActive(applicantLastActive)}` : 'Applicant offline'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Scrollable step-specific content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {renderGuide()}
                </div>
            </div>

        </div>

        {/* ── Applicant preview modal ───────────────────────────────────────── */}
        {previewOpen && (
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}
            >
                {/* Outer container — position:relative so cursor is anchored here (outside scrollable) */}
                <div style={{ position: 'relative', width: '98vw', maxWidth: 1440, height: '92vh', background: '#0a0a0a', border: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Preview chrome header */}
                    <div ref={previewHeaderRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, background: 'rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'// APPLICANT VIEW PREVIEW'}</div>
                            {applicantCursor && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'rgba(219,0,29,0.45)' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(219,0,29,0.6)' }} />
                                    Cursor live
                                </div>
                            )}
                        </div>
                        <button onClick={() => setPreviewOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px' }}>✕</button>
                    </div>
                    {/* Scrollable applicant page — no position:relative (cursor lives in outer container) */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <ApplicantPageView
                            step={step}
                            raisedHand={raisedHand}
                            connected={applicantConnected}
                            recruiterOnline
                            recruiterName={fields.recruiter || displayName}
                            introProgress={{
                                warmWelcome: introChecklist.warmWelcome,
                                processExplained: introChecklist.processExplained,
                                backgroundExplained: introChecklist.backgroundExplained,
                                valuesExplained: introChecklist.valuesExplained,
                            }}
                            livePreview={{
                                namePreview: fields.joiningName,
                                nameStatus,
                                nameOffensive,
                                nameSimilar,
                                bgProgress: bgChecklist,
                                previousUnits: fields.previousUnits,
                                currentUnit: fields.currentUnit,
                                experience: fields.experience,
                                availableNights: fields.availableNights,
                                opsPerMonth: fields.opsPerMonth,
                                primaryRole: fields.primaryRole,
                                additionalRoles: fields.additionalRoles,
                                departmentInterest: fields.departmentInterest,
                                rulesQuestionIndex: step === 12 ? rulesCurrentQuestion : 0,
                            }}
                            rulesAnswers={rulesAnswers}
                            staticMode
                        />
                    </div>
                    {/* Live cursor dot — position:absolute in outer container, outside scrollable div.
                        X: proportional to container width (no scrollbar distortion).
                        Y: offset by chrome header height, then proportional to content area height. */}
                    {applicantCursor && (() => {
                        const chromeH = previewHeaderRef.current?.offsetHeight ?? 34
                        return (
                            <div style={{
                                position: 'absolute', pointerEvents: 'none',
                                left: `${applicantCursor.x * 100}%`,
                                top: `calc(${chromeH}px + ${applicantCursor.y} * (100% - ${chromeH}px))`,
                                transform: 'translate(-50%, -50%)',
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'rgba(219,0,29,0.85)', border: '2px solid #db001d',
                                boxShadow: '0 0 10px rgba(219,0,29,0.6)',
                                transition: 'left 0.06s linear, top 0.06s linear',
                                zIndex: 10,
                            }} />
                        )
                    })()}
                </div>
            </div>
        )}
        </>
    )
}
