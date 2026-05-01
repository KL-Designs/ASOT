'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowBack, ArrowForward, Add, Delete, Person,
    BugReport, Lightbulb, Map, Feedback, ReportProblem, EmojiEvents, Warning,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import MediaUpload, { MediaState, emptyMedia } from '../_shared/MediaUpload'
import MemberSelect from '../_shared/MemberSelect'
import {
    INPUT_STYLE, SELECT_STYLE, TA_STYLE,
    ASOT_GAMES, FEATURE_CATEGORIES, UNIT_FEEDBACK_CATS,
    DISCORD_ISSUE_TYPES, TS_ISSUE_TYPES, MISSION_TYPES,
    AWARD_CATEGORIES, FB_TYPE_META, GUIDANCE_TEXT_COLOR, GUIDANCE_NUMBER_COLOR,
} from '../_shared/constants'

const DRAFT_KEY = 'community_ticket_draft_v3'
const DEBOUNCE_MS = 800

type Category = CommunityTicketCategory
type Step = 'category' | 'subtype' | 'form'
type SimilarTicket = { _id: string; title: string; category: string; subtype: string; status: string }
type CampaignMissionBlock = { objectiveIdeas: string; playerExperience: string; intelEvents: string }

// ── Section colour palette (desaturated, military-style dark UI) ──────────────
const SECT = {
    basicDetails:    { header: 'rgba(55, 80, 105, 0.92)',  body: 'rgba(55, 80, 105, 0.07)',  border: 'rgba(55, 80, 105, 0.28)'  },
    enemy:           { header: 'rgba(130, 30, 30, 0.92)',  body: 'rgba(130, 30, 30, 0.07)',  border: 'rgba(130, 30, 30, 0.28)'  },
    friendly:        { header: 'rgba(25, 58, 125, 0.92)',  body: 'rgba(25, 58, 125, 0.07)',  border: 'rgba(25, 58, 125, 0.28)'  },
    independent:     { header: 'rgba(36, 88, 46, 0.92)',   body: 'rgba(36, 88, 46, 0.07)',   border: 'rgba(36, 88, 46, 0.28)'   },
    civilian:        { header: 'rgba(80, 44, 108, 0.92)',  body: 'rgba(80, 44, 108, 0.07)',  border: 'rgba(80, 44, 108, 0.28)'  },
    storyTheme:      { header: 'rgba(108, 90, 25, 0.92)',  body: 'rgba(108, 90, 25, 0.07)',  border: 'rgba(108, 90, 25, 0.28)'  },
    objectives:      { header: 'rgba(118, 60, 16, 0.92)',  body: 'rgba(118, 60, 16, 0.07)',  border: 'rgba(118, 60, 16, 0.28)'  },
    additionalNotes: { header: 'rgba(108, 36, 56, 0.92)',  body: 'rgba(108, 36, 56, 0.07)',  border: 'rgba(108, 36, 56, 0.28)'  },
}

// ── Category definitions (6 cards: 3 public + 3 private) ─────────────────────
const CATEGORY_DEFS: { value: Category | 'mission-campaign'; label: string; icon: React.ReactNode; desc: string; color: string; isPrivate?: boolean; subtypes?: string[] }[] = [
    { value: 'request',          label: 'Request',              icon: <Lightbulb />,    desc: 'Mod or feature requests for the unit.',          color: 'rgba(255,160,0,0.85)'   },
    { value: 'bug',              label: 'Bug Report',           icon: <BugReport />,    desc: 'Report broken or unexpected behaviour.',         color: 'rgba(219,0,29,0.85)'    },
    { value: 'mission-campaign', label: 'Mission & Campaign',   icon: <Map />,          desc: 'Pitch a mission or campaign idea to J2.',        color: 'rgba(0,195,255,0.85)'   },
    { value: 'unit-feedback',    label: 'Unit Feedback',        icon: <Feedback />,     desc: 'Private feedback sent directly to J4.',          color: 'rgba(74,222,128,0.85)', isPrivate: true },
    { value: 'complaint',        label: 'Complaint',            icon: <ReportProblem />,desc: 'Report an issue involving a member. Private.',   color: 'rgba(255,80,80,0.85)',  isPrivate: true },
    { value: 'award',            label: 'Awards & Citations',   icon: <EmojiEvents />,  desc: 'Nominate a member or propose a new award.',      color: 'rgba(255,200,0,0.9)',   isPrivate: true },
]

const SUBTYPES: Record<string, { value: string; label: string; desc: string }[]> = {
    request: [
        { value: 'mod-request',     label: 'Mod Request',     desc: 'Request a mod to be added (all supported games).' },
        { value: 'feature-request', label: 'Feature Request', desc: 'Request a new feature for any platform.'         },
    ],
    bug: [
        { value: 'bug-arma',       label: 'Arma 3',     desc: 'In-game bug or technical issue.'                    },
        { value: 'bug-discord',    label: 'Discord',    desc: 'Roles, permissions, channels, or layout issues.'    },
        { value: 'bug-website',    label: 'Website',    desc: 'Bug or issue on this website.'                      },
        { value: 'bug-milpac',     label: 'MILPAC',     desc: 'Bug in the MILPAC personnel system.'                },
        { value: 'bug-teamspeak',  label: 'TeamSpeak',  desc: 'Permissions, channels, or access issues on TS.'     },
        { value: 'bug-other-game', label: 'Other Game', desc: 'Bug in another ASOT-supported game.'                },
        { value: 'bug-other',      label: 'Other',      desc: 'Something else not listed above.'                   },
    ],
    'mission-campaign': [
        { value: 'mission',  label: 'Mission Idea',  desc: 'A standalone operation pitch for J2.'                     },
        { value: 'campaign', label: 'Campaign Idea', desc: 'A multi-mission campaign pitch (minimum 3 missions).'      },
    ],
    'unit-feedback': [{ value: 'unit-feedback', label: 'Unit Feedback', desc: 'Feedback for J4 — private.' }],
    complaint: [
        { value: 'complaint-individual',  label: 'Individual',              desc: 'Complaint about a specific member.'        },
        { value: 'complaint-group',       label: 'Group',                   desc: 'Complaint about multiple members.'         },
        { value: 'complaint-department',  label: 'Callsign / Department',   desc: 'Complaint about a dept or callsign.'       },
    ],
    award: [
        { value: 'award-nomination', label: 'Nomination',          desc: 'Nominate a member for an existing award.'   },
        { value: 'award-creation',   label: 'Award & Citation Idea',desc: 'Propose a new award or citation.'          },
    ],
}

function getSingleSubtype(cat: string): string | null {
    const list = SUBTYPES[cat]
    return list?.length === 1 ? list[0].value : null
}

// Map combined category back to actual category for API
function realCategory(cat: string, subtype: string): Category {
    if (cat === 'mission-campaign') return subtype === 'campaign' ? 'campaign' : 'mission'
    return cat as Category
}


function SectionBlock({ title, num, colors, children }: { title: string; num: number; colors: { header: string; body: string; border: string }; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ background: colors.header, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.54rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.4)', flexShrink: 0, letterSpacing: '0.08em' }}>SEC {String(num).padStart(2, '0')}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.95)', textTransform: 'uppercase' }}>{title}</span>
            </div>
            <div style={{ background: colors.body, border: `1px solid ${colors.border}`, borderTop: 'none', padding: '14px 16px 2px' }}>
                {children}
            </div>
        </div>
    )
}

function SubField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.59rem', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.55)', marginBottom: 5, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span>{label}</span>
                {hint && <span style={{ fontWeight: 400, color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>— {hint}</span>}
            </div>
            {children}
        </div>
    )
}

function FieldBlock({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.6)' }}>{label}</span>
                {required && <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,1)', fontWeight: 700 }}>*</span>}
                {hint && <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.04em' }}>— {hint}</span>}
            </div>
            {children}
        </div>
    )
}

function ToggleSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div onClick={() => onChange(!on)} style={{ width: 32, height: 18, borderRadius: 9, position: 'relative', background: on ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.1)', border: `1px solid ${on ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`, cursor: 'pointer', transition: 'background 0.15s' }}>
                <div style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: GUIDANCE_TEXT_COLOR }}>{label}</span>
        </label>
    )
}

function GuidanceBlock({ title, items }: { title: string; items: string[] }) {
    return (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.28)', marginBottom: 10 }}>{title}</div>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, color: GUIDANCE_NUMBER_COLOR, marginTop: 1, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontSize: '0.68rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.55 }}>{item}</span>
                </div>
            ))}
        </div>
    )
}

function SimilarityWarning({ items, level, onNavigate }: { items: SimilarTicket[]; level: 'soft' | 'strong'; onNavigate: (id: string) => void }) {
    if (!items.length) return null
    const col = level === 'strong' ? 'rgba(219,0,29,0.9)' : 'rgba(255,160,0,0.85)'
    return (
        <div style={{ background: level === 'strong' ? 'rgba(219,0,29,0.08)' : 'rgba(255,160,0,0.06)', border: `1px solid ${level === 'strong' ? 'rgba(219,0,29,0.35)' : 'rgba(255,160,0,0.3)'}`, borderLeft: `3px solid ${col}`, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: col, marginBottom: 6 }}>
                {level === 'strong' ? '⚠ STRONG SIMILARITY DETECTED' : 'SIMILAR TICKETS FOUND'}
            </div>
            <div style={{ fontSize: '0.65rem', color: GUIDANCE_TEXT_COLOR, marginBottom: 8 }}>
                {level === 'strong' ? 'Your submission is very similar to existing tickets. Please review before continuing.' : 'These look similar — check them before submitting.'}
            </div>
            {items.map(t => (
                <button key={t._id} type='button' onClick={() => onNavigate(t._id)} style={{ display: 'block', marginBottom: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(0,195,255,0.8)', textDecoration: 'underline' }}>{t.title}</span>
                </button>
            ))}
        </div>
    )
}

function OtherInput({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
    return (
        <div style={{ marginTop: 6, borderLeft: '2px solid rgba(255,255,255,0.15)', paddingLeft: 10 }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>
                PLEASE SPECIFY {required && <span style={{ color: 'rgba(219,0,29,1)' }}>*</span>}
            </div>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? 'Describe in detail…'} required={required} style={INPUT_STYLE} />
        </div>
    )
}

function CharCount({ n, max }: { n: number; max: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: n > max * 0.9 ? 'rgba(255,160,0,0.7)' : 'rgba(237,237,237,0.22)' }}>{n}/{max}</span>
        </div>
    )
}


export default function NewTicketPage() {
    const router = useRouter()

    const [step, setStep] = useState<Step>('category')
    const [displayCat, setDisplayCat] = useState<string | null>(null)   // UI category (may be 'mission-campaign')
    const [subtype, setSubtype] = useState<string | null>(null)

    // Common fields
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [justification, setJustification] = useState('')
    const [otherComments, setOtherComments] = useState('')
    const [isAnonymous, setIsAnonymous] = useState(false)
    const [media, setMedia] = useState<MediaState>(emptyMedia())

    // Request
    const [modLink, setModLink] = useState('')
    const [game, setGame] = useState('Arma 3')
    const [gameOther, setGameOther] = useState('')
    const [featureCategory, setFeatureCategory] = useState('')
    const [featureCategoryOther, setFeatureCategoryOther] = useState('')
    const [responsibleDept, setResponsibleDept] = useState('')
    const [weblink, setWeblink] = useState('')

    // Bug
    const [stepsToReproduce, setStepsToReproduce] = useState('')
    const [expectedResult, setExpectedResult] = useState('')
    const [actualResult, setActualResult] = useState('')
    const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('low')
    const [discordIssueTypes, setDiscordIssueTypes] = useState<string[]>([])
    const [discordIssueDetail, setDiscordIssueDetail] = useState('')
    const [discordIssueOther, setDiscordIssueOther] = useState('')
    const [bugUrl, setBugUrl] = useState('')
    const [tsBugType, setTsBugType] = useState('')
    const [tsBugOther, setTsBugOther] = useState('')
    const [bugOtherDetail, setBugOtherDetail] = useState('')
    // MILPAC-specific
    const [milpacMembers, setMilpacMembers] = useState<string[]>([])
    const [milpacMultiple, setMilpacMultiple] = useState(false)

    // Mission / Campaign — Section 1: Basic Details
    const [missionType, setMissionType] = useState<'midweek' | 'weekend'>('midweek')
    const [missionMap, setMissionMap] = useState('')
    const [missionEra, setMissionEra] = useState('')
    const [missionModSuggestions, setMissionModSuggestions] = useState('')
    const [missionStyle, setMissionStyle] = useState('')
    // Section 2: Enemy Forces
    const [enemyFaction, setEnemyFaction] = useState('')
    const [enemyTactics, setEnemyTactics] = useState('')
    const [enemyAssets, setEnemyAssets] = useState('')
    const [enemyNotes, setEnemyNotes] = useState('')
    // Section 3: Friendly Forces
    const [friendlyFaction, setFriendlyFaction] = useState('')
    const [friendlyTactics, setFriendlyTactics] = useState('')
    const [friendlyAssets, setFriendlyAssets] = useState('')
    const [friendlyNotes, setFriendlyNotes] = useState('')
    // Section 4: Independent Forces
    const [indepenFaction, setIndepenFaction] = useState('')
    const [indepenRelationship, setIndepenRelationship] = useState('')
    const [indepenTactics, setIndepenTactics] = useState('')
    const [indepenAssets, setIndepenAssets] = useState('')
    const [indepenNotes, setIndepenNotes] = useState('')
    // Section 5: Civilian Populace
    const [civFaction, setCivFaction] = useState('')
    const [civRelationship, setCivRelationship] = useState('')
    const [civAssets, setCivAssets] = useState('')
    const [civNotes, setCivNotes] = useState('')
    // Section 6: Mission Theme & Story
    const [missionStoryOverall, setMissionStoryOverall] = useState('')
    const [missionHistoricalInspiration, setMissionHistoricalInspiration] = useState('')
    // Section 7: Objectives & Intel (mission only — single block)
    const [missionObjectiveIdeas, setMissionObjectiveIdeas] = useState('')
    const [missionPlayerExp, setMissionPlayerExp] = useState('')
    const [missionIntelEvents, setMissionIntelEvents] = useState('')
    // Section 8: Additional Notes
    const [missionUniqueMechanics, setMissionUniqueMechanics] = useState('')
    const [missionAtmosphere, setMissionAtmosphere] = useState('')
    const [missionSpecialRequirements, setMissionSpecialRequirements] = useState('')
    const [missionFinalComments, setMissionFinalComments] = useState('')
    // Campaign: multi-mission Objectives blocks (Section 7 per mission) — minimum 3
    const [campaignMissions, setCampaignMissions] = useState<CampaignMissionBlock[]>([
        { objectiveIdeas: '', playerExperience: '', intelEvents: '' },
        { objectiveIdeas: '', playerExperience: '', intelEvents: '' },
        { objectiveIdeas: '', playerExperience: '', intelEvents: '' },
    ])

    // Complaint — submit on behalf of another member
    const [submitOnBehalf, setSubmitOnBehalf] = useState(false)
    const [onBehalfMember, setOnBehalfMember] = useState<string[]>([])
    const [onBehalfAnonymous, setOnBehalfAnonymous] = useState(false)

    // Unit Feedback
    const [feedbackCategories, setFeedbackCategories] = useState<string[]>([])
    const [feedbackCategoryOther, setFeedbackCategoryOther] = useState('')
    const [feedbackType, setFeedbackType] = useState<'positive' | 'neutral' | 'negative'>('neutral')

    // Complaint
    const [complainantAnonymous, setComplainantAnonymous] = useState(false)
    const [complainantName, setComplainantName] = useState('')
    const [membersInvolved, setMembersInvolved] = useState<string[]>([])
    const [membersNotListed, setMembersNotListed] = useState('')
    const [isStaffComplaint, setIsStaffComplaint] = useState(false)
    const [desiredOutcome, setDesiredOutcome] = useState('')
    const [evidenceAcknowledged, setEvidenceAcknowledged] = useState(false)

    // Award Nomination
    const [nomineeNames, setNomineeNames] = useState<string[]>([])   // member selector returns names
    const [nominatorName, setNominatorName] = useState('')
    const [supportingMembers, setSupportingMembers] = useState<string[]>([])
    const [awardType, setAwardType] = useState('')

    // Award Creation
    const [awardCategory, setAwardCategory] = useState('')
    const [awardCategoryOther, setAwardCategoryOther] = useState('')
    const [awardRequirements, setAwardRequirements] = useState('')
    const [awardDesignRef, setAwardDesignRef] = useState('')
    const [awardDesignNotes, setAwardDesignNotes] = useState('')

    // Duplicate/similarity
    const [similar, setSimilar] = useState<SimilarTicket[]>([])
    const [modDuplicate, setModDuplicate] = useState<string | null>(null)

    // Current user identity (auto-filled)
    const [myName, setMyName] = useState('')

    // ORBAT callsigns for complaint-department picker
    const [callsigns, setCallsigns] = useState<{ label: string; group: string }[]>([])
    const [callsignsLoaded, setCallsignsLoaded] = useState(false)

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [draftSaved, setDraftSaved] = useState(false)
    const [discardModal, setDiscardModal] = useState(false)
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Auto-fill current user identity
    useEffect(() => {
        fetch('/api/me')
            .then(r => r.json())
            .then(d => {
                const nick = (d.guild?.nickname ?? '').replace(/\s*\[[^\]]*\]/g, '').trim()
                const nickParts = nick.split(' ')
                const parsedName = nickParts.length > 1 ? nickParts.slice(1).join(' ') : nick
                const name = d.name || parsedName || d.globalName || d.username || ''
                setMyName(name)
                setComplainantName(name)
            })
            .catch(() => {})
    }, [])

    // Fetch callsigns when department-complaint subtype is active
    useEffect(() => {
        if (subtype !== 'complaint-department' || callsignsLoaded) return
        fetch('/api/community/callsigns')
            .then(r => r.json())
            .then(d => { setCallsigns(d.callsigns ?? []); setCallsignsLoaded(true) })
            .catch(() => {})
    }, [subtype, callsignsLoaded])

    // Draft load
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY)
            if (!raw) return
            const d = JSON.parse(raw)
            if (d.displayCat) { setDisplayCat(d.displayCat); setStep('subtype') }
            if (d.subtype) { setSubtype(d.subtype); setStep('form') }
            if (d.title) setTitle(d.title)
            if (d.description) setDescription(d.description)
            if (d.game) setGame(d.game)
            if (d.missionType) setMissionType(d.missionType)
            if (d.feedbackCategories) setFeedbackCategories(d.feedbackCategories)
        } catch { /* ignore */ }
    }, [])

    const saveDraft = useCallback(() => {
        if (!displayCat) return
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ displayCat, subtype, title, description, game, missionType, feedbackCategories }))
            setDraftSaved(true)
            setTimeout(() => setDraftSaved(false), 1800)
        } catch { /* ignore */ }
    }, [displayCat, subtype, title, description, game, missionType, feedbackCategories])

    useEffect(() => {
        if (step !== 'form') return
        const t = setTimeout(saveDraft, DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [step, saveDraft])

    // Title similarity
    useEffect(() => {
        if (!title.trim() || title.length < 6 || !displayCat) return
        if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
        titleDebounceRef.current = setTimeout(async () => {
            try {
                const apiCat = displayCat === 'mission-campaign' ? 'mission' : displayCat
                const res = await fetch(`/api/community/tickets/similar?title=${encodeURIComponent(title)}&category=${apiCat}`)
                setSimilar(await res.json().catch(() => []))
            } catch { /* ignore */ }
        }, 600)
        return () => { if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current) }
    }, [title, displayCat])

    // Mod link duplicate check
    useEffect(() => {
        if (subtype !== 'mod-request' || !modLink.trim()) { setModDuplicate(null); return }
        const t = setTimeout(async () => {
            try {
                const res = await fetch('/api/community/tickets?category=request&sort=newest')
                const all = await res.json()
                const norm = modLink.trim().toLowerCase().replace(/\/+$/, '')
                const dup = all.find((t: CommunityTicket & { _id: string }) =>
                    t.subtype === 'mod-request' && t.modLink?.toLowerCase().replace(/\/+$/, '') === norm
                )
                setModDuplicate(dup ? dup._id : null)
            } catch { /* ignore */ }
        }, 500)
        return () => clearTimeout(t)
    }, [modLink, subtype])

    function selectDisplayCat(cat: string) {
        setDisplayCat(cat)
        setSubtype(null)
        const single = getSingleSubtype(cat)
        if (single) { setSubtype(single); setStep('form') }
        else setStep('subtype')
    }

    function discard() { setDiscardModal(true) }
    function confirmDiscard() {
        localStorage.removeItem(DRAFT_KEY)
        router.push('/community/tickets')
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (!displayCat || !subtype) return
        if (!title.trim()) return setError('Title is required.')
        if (!description.trim()) return setError('Description is required.')
        if (subtype === 'mod-request' && !modLink.trim()) return setError('Mod link is required.')
        if (displayCat === 'complaint' && !evidenceAcknowledged) return setError('Please acknowledge the evidence policy.')
        if (subtype === 'bug-teamspeak' && tsBugType === 'other' && !tsBugOther.trim()) return setError('Please specify the TeamSpeak issue.')
        if (featureCategory === 'Other' && !featureCategoryOther.trim()) return setError('Please specify the feature category.')
        if (game === 'Other' && !gameOther.trim()) return setError('Please specify the game.')
        if (awardCategory === 'Suggest New Category' && !awardCategoryOther.trim()) return setError('Please specify the new category.')
        if (feedbackCategories.includes('Other') && !feedbackCategoryOther.trim()) return setError('Please specify the feedback category.')

        setSubmitting(true)
        const category = realCategory(displayCat, subtype)
        const allLinks = [...media.videoLinks, ...media.otherLinks]

        const body: Record<string, unknown> = {
            category, subtype, title: title.trim(), description: description.trim(), isAnonymous,
            ...(justification && { justification }),
            ...(otherComments && { otherComments }),
            ...(allLinks.length && { mediaLinks: allLinks }),
            ...(modLink && { modLink }),
            ...(game && { game }), ...(game === 'Other' && gameOther && { gameOther }),
            ...(featureCategory && { featureCategory }),
            ...(featureCategory === 'Other' && featureCategoryOther && { featureCategoryOther }),
            ...(responsibleDept && subtype === 'feature-request' && { responsibleDept }),
            ...(weblink && { weblink }),
            ...(stepsToReproduce && { stepsToReproduce }),
            ...(expectedResult && { expectedResult }), ...(actualResult && { actualResult }),
            ...(severity && { severity }),
            ...(discordIssueTypes.length && { discordIssueTypes }),
            ...(discordIssueDetail && { discordIssueDetail }),
            ...(discordIssueOther && { discordIssueDetail: discordIssueOther }),
            ...(bugUrl && { bugUrl }),
            ...(tsBugType && { tsBugType }),
            ...(tsBugType === 'other' && tsBugOther && { bugPlatformDetail: tsBugOther }),
            ...(bugOtherDetail && { bugPlatformDetail: bugOtherDetail }),
            ...(milpacMembers.length && { membersInvolved: milpacMembers }),
            ...(missionType && { missionType }),
            ...(missionMap && { missionMap }),
            ...(missionEra && { missionEra }),
            ...(missionModSuggestions && { missionModSuggestions }),
            ...(missionStyle && { missionStyle }),
            ...(enemyFaction && { missionEnemyFaction: enemyFaction }),
            ...(enemyTactics && { missionEnemyTactics: enemyTactics }),
            ...(enemyAssets && { missionEnemyAssets: enemyAssets }),
            ...(enemyNotes && { missionEnemyNotes: enemyNotes }),
            ...(friendlyFaction && { missionFriendlyFaction: friendlyFaction }),
            ...(friendlyTactics && { missionFriendlyTactics: friendlyTactics }),
            ...(friendlyAssets && { missionFriendlyAssets: friendlyAssets }),
            ...(friendlyNotes && { missionFriendlyNotes: friendlyNotes }),
            ...(indepenFaction && { missionIndepenFaction: indepenFaction }),
            ...(indepenRelationship && { missionIndepenRelationship: indepenRelationship }),
            ...(indepenTactics && { missionIndepenTactics: indepenTactics }),
            ...(indepenAssets && { missionIndepenAssets: indepenAssets }),
            ...(indepenNotes && { missionIndepenNotes: indepenNotes }),
            ...(civFaction && { missionCivFaction: civFaction }),
            ...(civRelationship && { missionCivRelationship: civRelationship }),
            ...(civAssets && { missionCivAssets: civAssets }),
            ...(civNotes && { missionCivNotes: civNotes }),
            ...(missionStoryOverall && { missionStory: missionStoryOverall }),
            ...(missionHistoricalInspiration && { missionHistoricalInspiration }),
            ...(subtype === 'mission' && missionObjectiveIdeas && { missionObjectives: missionObjectiveIdeas }),
            ...(subtype === 'mission' && missionPlayerExp && { missionPlayerExperience: missionPlayerExp }),
            ...(subtype === 'mission' && missionIntelEvents && { missionIntelEvents }),
            ...(missionUniqueMechanics && { missionMechanics: missionUniqueMechanics }),
            ...(missionAtmosphere && { missionAtmosphere }),
            ...(missionSpecialRequirements && { missionSpecialRequirements }),
            ...(missionFinalComments && { missionAdditionalNotes: missionFinalComments }),
            ...(subtype === 'campaign' && { campaignMissions: campaignMissions.filter(m => m.objectiveIdeas || m.playerExperience || m.intelEvents) }),
            ...(feedbackCategories.length && { feedbackCategories }),
            ...(feedbackCategories.includes('Other') && feedbackCategoryOther && { feedbackCategoryOther }),
            ...(feedbackType && { feedbackType }),
            ...(complainantAnonymous !== undefined && { complainantAnonymous }),
            ...(!complainantAnonymous && complainantName && { complainantName }),
            ...(submitOnBehalf && { submitOnBehalf }),
            ...(submitOnBehalf && onBehalfMember.length && { onBehalfMember: onBehalfMember[0] }),
            ...(submitOnBehalf && { onBehalfAnonymous }),
            ...(membersInvolved.length && { membersInvolved }),
            ...(membersNotListed && { membersInvolvedNotListed: membersNotListed }),
            ...(isStaffComplaint !== undefined && { isStaffComplaint }),
            ...(desiredOutcome && { desiredOutcome }),
            ...(evidenceAcknowledged !== undefined && { evidenceAcknowledged }),
            ...(nomineeNames.length && { nomineeName: nomineeNames[0] }),
            ...(nominatorName && { nominatorName }),
            ...(supportingMembers.length && { supportingMembers }),
            ...(awardType && { awardType }),
            ...(awardCategory && { awardCategory }),
            ...(awardCategory === 'Suggest New Category' && awardCategoryOther && { awardCategoryOther }),
            ...(awardRequirements && { awardRequirements }),
            ...(awardDesignRef && { awardDesignRef }),
            ...(awardDesignNotes && { awardDesignNotes }),
        }

        const res = await fetch('/api/community/tickets', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json()
        setSubmitting(false)

        if (!res.ok) {
            if (json.error === 'DUPLICATE_MOD') { setError('This mod has already been suggested.'); setModDuplicate(json.existingId); return }
            setError(json.error ?? 'Submission failed.')
            return
        }

        if (media.images.length > 0) {
            const fd = new FormData()
            media.images.forEach(f => fd.append('files', f))
            await fetch(`/api/community/tickets/${json._id}/uploads`, { method: 'POST', body: fd }).catch(() => {})
        }

        localStorage.removeItem(DRAFT_KEY)
        router.push(`/community/tickets/${json._id}`)
    }

    const catDef = displayCat ? CATEGORY_DEFS.find(c => c.value === displayCat) : null
    const catColor = catDef?.color ?? 'rgba(237,237,237,0.5)'
    const subtypeDef = displayCat && subtype ? SUBTYPES[displayCat]?.find(s => s.value === subtype) : null

    return (
        <>
        {discardModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#111', border: '1px solid rgba(219,0,29,0.35)', borderTop: '3px solid rgba(219,0,29,0.6)', padding: '28px', maxWidth: 400, width: '90%' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.9)', marginBottom: 8 }}>DISCARD TICKET</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', marginBottom: 24, lineHeight: 1.5 }}>Your draft will be permanently deleted. This cannot be undone.</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setDiscardModal(false)} style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.55)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>CANCEL</button>
                        <button onClick={confirmDiscard} style={{ padding: '8px 18px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.95)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em' }}>DISCARD</button>
                    </div>
                </div>
            </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Nav bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Link href='/community/tickets'>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0 }}>
                        <ArrowBack style={{ fontSize: 14 }} /> BACK
                    </button>
                </Link>
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'rgba(74,222,128,0.6)', letterSpacing: '0.1em', fontFamily: 'monospace', opacity: draftSaved ? 1 : 0, transition: 'opacity 0.3s' }}>
                    DRAFT SAVED
                </span>
                <button
                    onClick={discard}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.85)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', padding: '6px 14px', transition: 'background 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(219,0,29,0.2)'; e.currentTarget.style.borderColor = 'rgba(219,0,29,0.7)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(219,0,29,0.1)'; e.currentTarget.style.borderColor = 'rgba(219,0,29,0.4)' }}
                >
                    DISCARD TICKET
                </button>
            </div>

            {/* Step bar — 2 steps for single-subtype categories, 3 steps otherwise */}
            {(() => {
                const hasSingle = displayCat !== null && getSingleSubtype(displayCat) !== null
                const visibleSteps: Step[] = hasSingle ? ['category', 'form'] : ['category', 'subtype', 'form']
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
                        {visibleSteps.map((s, i) => {
                            const isCurrent = step === s
                            const isPast = visibleSteps.indexOf(s) < visibleSteps.indexOf(step === 'subtype' || visibleSteps.includes(step) ? step : 'form')
                            return (
                                <React.Fragment key={s}>
                                    <div style={{ padding: '5px 12px', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', background: isCurrent ? 'rgba(219,0,29,0.12)' : 'transparent', border: `1px solid ${isCurrent ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.07)'}`, color: isCurrent ? 'rgba(219,0,29,0.9)' : isPast ? 'rgba(237,237,237,0.45)' : 'rgba(237,237,237,0.18)', cursor: isPast ? 'pointer' : 'default' }}
                                        onClick={() => {
                                            if (s === 'category') setStep('category')
                                            else if (s === 'subtype' && step === 'form' && displayCat && SUBTYPES[displayCat]?.length > 1) setStep('subtype')
                                        }}>
                                        {String(i + 1).padStart(2, '0')} — {s.toUpperCase()}
                                    </div>
                                    {i < visibleSteps.length - 1 && <ArrowForward style={{ fontSize: 12, color: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />}
                                </React.Fragment>
                            )
                        })}
                    </div>
                )
            })()}

            {/* ── STEP 1: 6-card category grid (3 × 2) ── */}
            {step === 'category' && (
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>
                    <aside>
                        <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>ASOT // PORTAL</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em' }}>SUBMIT TICKET</div>
                            <div style={{ fontSize: '0.68rem', color: GUIDANCE_TEXT_COLOR, marginTop: 3, lineHeight: 1.4 }}>Select a category to begin. Private categories are only visible to J4.</div>
                        </div>
                        <div style={{ fontSize: '0.65rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.65, padding: '10px 0' }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)', marginBottom: 8 }}>NOTES</div>
                            Your draft is auto-saved as you type.
                            <br /><br />
                            Search existing tickets before submitting to avoid duplicates.
                        </div>
                    </aside>

                    {/* 3 × 2 grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {CATEGORY_DEFS.map(cat => (
                            <button key={cat.value} onClick={() => selectDisplayCat(cat.value)} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.07)`, borderTop: `2px solid ${cat.color}`, padding: '18px 14px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}>
                                <div style={{ color: cat.color, fontSize: '1.4rem', marginBottom: 10 }}>{cat.icon}</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.9)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {cat.label}
                                    {cat.isPrivate && <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.1em', padding: '1px 4px', color: 'rgba(255,80,80,0.7)', border: '1px solid rgba(255,80,80,0.2)', flexShrink: 0 }}>PRIVATE</span>}
                                </div>
                                <div style={{ fontSize: '0.63rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.4 }}>{cat.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── STEP 2: Subtype ── */}
            {step === 'subtype' && displayCat && (
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>
                    <aside>
                        <div style={{ background: `${catColor}0d`, border: `1px solid ${catColor}33`, padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: catColor, marginBottom: 4 }}>{catDef?.label.toUpperCase()}{' // TYPE'}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em' }}>SELECT SUBTYPE</div>
                        </div>
                        <button onClick={() => setStep('category')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.38)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, padding: '8px 2px' }}>
                            <ArrowBack style={{ fontSize: 13 }} /> Change category
                        </button>
                    </aside>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(SUBTYPES[displayCat] ?? []).map(st => (
                            <button key={st.value} onClick={() => { setSubtype(st.value); setStep('form') }} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${catColor}55`, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', marginBottom: 3 }}>{st.label}</div>
                                <div style={{ fontSize: '0.7rem', color: GUIDANCE_TEXT_COLOR }}>{st.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── STEP 3: Form ── */}
            {step === 'form' && displayCat && subtype && (
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>

                    {/* Sidebar */}
                    <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{ background: `${catColor}0d`, border: `1px solid ${catColor}33`, padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: catColor, marginBottom: 4 }}>{catDef?.label.toUpperCase()}</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.1em' }}>{subtypeDef?.label}</div>
                        </div>

                        {catDef?.isPrivate && (
                            <div style={{ background: 'rgba(0,100,255,0.07)', border: '1px solid rgba(0,150,255,0.25)', borderLeft: '3px solid rgba(0,150,255,0.5)', padding: '10px 12px', marginBottom: 8 }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(0,195,255,0.8)', marginBottom: 4 }}>PRIVATE SUBMISSION</div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(0,195,255,0.55)', lineHeight: 1.5 }}>Only visible to J4. Not visible to members.</div>
                            </div>
                        )}

                        <button onClick={() => setStep(displayCat && SUBTYPES[displayCat]?.length > 1 ? 'subtype' : 'category')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.38)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, padding: '8px 2px', marginBottom: 6 }}>
                            <ArrowBack style={{ fontSize: 13 }} /> Change type
                        </button>

                        {/* Type-specific guidance */}
                        {subtype === 'mod-request' && <GuidanceBlock title='MOD REQUEST GUIDE' items={['Is it necessary for ASOT gameplay?', 'Does it add unique value not already covered?', 'Is the performance cost acceptable?', 'Is it unlikely to conflict with existing mods?', 'Does it support most game modes we run?']} />}
                        {subtype === 'feature-request' && <GuidanceBlock title='FEATURE REQUEST GUIDE' items={['Specify the platform (Arma, Website, Discord, MILPAC, etc.)', 'Describe what problem this feature solves.', 'Include reference links or examples if applicable.', 'Keep scope focused — one feature per ticket.']} />}
                        {displayCat === 'bug' && <GuidanceBlock title='BUG REPORT GUIDE' items={['Provide exact steps to reproduce the issue.', 'State expected vs actual behaviour clearly.', 'Set severity honestly — not everything is Critical.', 'Attach screenshots or video where helpful.']} />}
                        {(subtype === 'mission' || subtype === 'campaign') && <GuidanceBlock title='MISSION GUIDE' items={['Use the ASOT mission template structure.', 'Describe forces, objectives, and narrative clearly.', 'Consider player count and intended experience.', subtype === 'campaign' ? 'Campaigns require minimum 3 missions.' : 'Choose Midweek or Weekend operation type.']} />}
                        {displayCat === 'unit-feedback' && <GuidanceBlock title='FEEDBACK NOTES' items={['Visible to J4 only — not to other members.', 'Multiple categories can be selected.', 'Anonymous submissions are supported.', 'Select "Other" to specify a custom category.']} />}
                        {displayCat === 'complaint' && <GuidanceBlock title='COMPLAINT NOTES' items={['Fully confidential — reviewed by J4 only.', 'One complaint per subject recommended.', 'Evidence is helpful but not required.', 'False complaints may result in disciplinary action.']} />}
                        {displayCat === 'award' && subtype === 'award-nomination' && <GuidanceBlock title='NOMINATION GUIDE' items={['Nominee must meet ~50–75% of eligibility criteria.', 'J4 may assign an alternate award if not eligible.', 'Supporting members will be notified to confirm.', 'Be specific — vague nominations are harder to action.']} />}
                        {displayCat === 'award' && subtype === 'award-creation' && (
                            <>
                                <GuidanceBlock title='AWARD CREATION GUIDE' items={['Define who is eligible and how it is earned.', 'Specify what behaviour or achievement it recognises.', 'Include design inspiration (colour, style, imagery).', 'Reference existing awards for scale and category fit.']} />
                                {/* Design reference panel */}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 8 }}>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.28)', marginBottom: 10 }}>DESIGN REFERENCE EXAMPLES</div>
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.25)', marginBottom: 5, letterSpacing: '0.1em' }}>RIBBON</div>
                                        <img src='/milpac-assets/imge/ribbons/1year.png' alt='example ribbon' style={{ height: 24, border: '1px solid rgba(255,255,255,0.15)', display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.25)', marginBottom: 5, letterSpacing: '0.1em' }}>MEDAL</div>
                                        <img src='/milpac-assets/medal-box-images/medals/1year.png' alt='example medal' style={{ height: 160, display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                    </div>
                                    <div style={{ fontSize: '0.63rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.5 }}>
                                        Submit colour ideas, ribbon layout concepts, and medal style inspiration in the Design Notes field.
                                    </div>
                                </div>
                            </>
                        )}
                    </aside>

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                        {similar.length > 0 && title.length > 10 && (
                            <SimilarityWarning items={similar} level={similar.length >= 3 ? 'strong' : 'soft'} onNavigate={id => { saveDraft(); router.push(`/community/tickets/${id}`) }} />
                        )}

                        {modDuplicate && (
                            <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.35)', borderLeft: '3px solid rgba(219,0,29,0.7)', padding: '10px 14px', marginBottom: 12 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.9)', marginBottom: 4 }}>⚠ THIS MOD HAS ALREADY BEEN SUGGESTED</div>
                                <button type='button' onClick={() => { saveDraft(); router.push(`/community/tickets/${modDuplicate!}`) }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', color: 'rgba(0,195,255,0.8)', textDecoration: 'underline' }}>View existing ticket →</button>
                            </div>
                        )}

                        {/* ── MOD REQUEST ── */}
                        {subtype === 'mod-request' && (
                            <>
                                <FieldBlock label='GAME' hint='Select first — defaults to Arma 3'>
                                    <select value={game} onChange={e => setGame(e.target.value)} style={SELECT_STYLE}>
                                        {ASOT_GAMES.map(g => <option key={g} value={g} style={{ background: '#111' }}>{g}</option>)}
                                    </select>
                                    {game === 'Other' && <OtherInput value={gameOther} onChange={setGameOther} placeholder='Specify game name…' required />}
                                </FieldBlock>
                                <FieldBlock label='TITLE' hint='Mod name or brief description' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. ACE3 Medical Expansion' maxLength={120} style={INPUT_STYLE} />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>
                                <FieldBlock label='MOD LINK' hint='Workshop, GitHub, or release URL' required>
                                    <input value={modLink} onChange={e => setModLink(e.target.value)} placeholder='https://steamcommunity.com/sharedfiles/…' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What does this mod do?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={TA_STYLE} placeholder='Describe what this mod adds or changes and why it would benefit ASOT operations.' />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' hint='Why should ASOT use this?'>
                                    <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} style={TA_STYLE} placeholder='Does it fill a gap? Does it improve gameplay? What unique value does it add?' />
                                </FieldBlock>
                            </>
                        )}

                        {/* ── FEATURE REQUEST ── */}
                        {subtype === 'feature-request' && (
                            <>
                                <FieldBlock label='TITLE' hint='Brief feature summary' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. Add dark mode to the calendar' maxLength={120} style={INPUT_STYLE} />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>
                                <FieldBlock label='CATEGORY' hint='Which platform?'>
                                    <select value={featureCategory} onChange={e => setFeatureCategory(e.target.value)} style={SELECT_STYLE}>
                                        <option value='' style={{ background: '#111' }}>Select…</option>
                                        {FEATURE_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#111' }}>{c}</option>)}
                                    </select>
                                    {featureCategory === 'Other' && <OtherInput value={featureCategoryOther} onChange={setFeatureCategoryOther} required />}
                                </FieldBlock>
                                <FieldBlock label='RESPONSIBLE DEPARTMENT' hint='Optional — which department should handle this?'>
                                    <select value={responsibleDept} onChange={e => setResponsibleDept(e.target.value)} style={SELECT_STYLE}>
                                        <option value='' style={{ background: '#111' }}>J4 Administration (default)</option>
                                        <option value='j1' style={{ background: '#111' }}>J1 — Recruitment</option>
                                        <option value='j2' style={{ background: '#111' }}>J2 — Mission Making</option>
                                        <option value='j3' style={{ background: '#111' }}>J3 — Training</option>
                                        <option value='j4' style={{ background: '#111' }}>J4 — Administration</option>
                                        <option value='j5' style={{ background: '#111' }}>J5 — Media</option>
                                        <option value='j6' style={{ background: '#111' }}>J6 — Game Masters</option>
                                        <option value='j7' style={{ background: '#111' }}>J7 — Community Development</option>
                                    </select>
                                </FieldBlock>
                                <FieldBlock label='REFERENCE LINK' hint='Optional URL or example'>
                                    <input value={weblink} onChange={e => setWeblink(e.target.value)} placeholder='https://…' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What should it do and why?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} style={TA_STYLE} placeholder='Describe the feature, how it should work, and what problem it solves.' />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' hint='How would this help?'>
                                    <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} style={TA_STYLE} />
                                </FieldBlock>
                            </>
                        )}

                        {/* ── BUGS ── */}
                        {displayCat === 'bug' && (
                            <>
                                <FieldBlock label='TITLE' hint='Short, specific summary of the issue' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={INPUT_STYLE} placeholder={
                                        subtype === 'bug-arma'    ? 'e.g. ACE medical menu not opening after revive' :
                                        subtype === 'bug-discord' ? 'e.g. Riflemen role missing from #ops-planning channel' :
                                        subtype === 'bug-website' ? 'e.g. Navigation menu breaks on mobile viewport' :
                                        subtype === 'bug-milpac'  ? 'e.g. Promotion date not updating after CO approval' :
                                        'Brief summary of the bug…'
                                    } />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>

                                {/* Platform-specific secondary fields — placed directly below title */}
                                {subtype === 'bug-discord' && (
                                    <FieldBlock label='ISSUE TYPE' hint='Select all that apply'>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {DISCORD_ISSUE_TYPES.map(t => {
                                                const active = discordIssueTypes.includes(t.value)
                                                return (
                                                    <button key={t.value} type='button' onClick={() => setDiscordIssueTypes(prev => active ? prev.filter(x => x !== t.value) : [...prev, t.value])} style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', background: active ? 'rgba(0,195,255,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(0,195,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: active ? 'rgba(0,195,255,0.9)' : GUIDANCE_TEXT_COLOR, cursor: 'pointer' }}>
                                                        {t.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        {discordIssueTypes.length > 0 && !discordIssueTypes.includes('other') && (
                                            <input value={discordIssueDetail} onChange={e => setDiscordIssueDetail(e.target.value)} placeholder='Channel name, role name, or specific detail…' style={{ ...INPUT_STYLE, marginTop: 8 }} />
                                        )}
                                        {discordIssueTypes.includes('other') && (
                                            <OtherInput value={discordIssueOther} onChange={setDiscordIssueOther} placeholder='Describe the Discord issue in detail…' required />
                                        )}
                                    </FieldBlock>
                                )}

                                {(subtype === 'bug-website' || subtype === 'bug-milpac') && (
                                    <FieldBlock label='PAGE URL' hint='URL where the bug occurs'>
                                        <input value={bugUrl} onChange={e => setBugUrl(e.target.value)} placeholder='https://…' style={INPUT_STYLE} />
                                    </FieldBlock>
                                )}

                                {subtype === 'bug-milpac' && (
                                    <FieldBlock label='AFFECTED MEMBER' hint='Search and select the member with the MILPAC issue'>
                                        <MemberSelect value={milpacMembers} onChange={setMilpacMembers} placeholder='Search member…' multi={milpacMultiple} />
                                        <div style={{ marginTop: 8 }}>
                                            <ToggleSwitch on={milpacMultiple} onChange={v => { setMilpacMultiple(v); if (!v) setMilpacMembers(milpacMembers.slice(0, 1)) }} label='Multiple members affected' />
                                        </div>
                                    </FieldBlock>
                                )}

                                {subtype === 'bug-teamspeak' && (
                                    <FieldBlock label='ISSUE TYPE'>
                                        <select value={tsBugType} onChange={e => setTsBugType(e.target.value)} style={SELECT_STYLE}>
                                            <option value='' style={{ background: '#111' }}>Select…</option>
                                            {TS_ISSUE_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: '#111' }}>{t.label}</option>)}
                                        </select>
                                        {tsBugType === 'other' && <OtherInput value={tsBugOther} onChange={setTsBugOther} required />}
                                    </FieldBlock>
                                )}

                                {(subtype === 'bug-arma' || subtype === 'bug-other-game') && (
                                    <>
                                        {subtype === 'bug-other-game' && (
                                            <FieldBlock label='GAME'>
                                                <select value={game} onChange={e => setGame(e.target.value)} style={SELECT_STYLE}>
                                                    {ASOT_GAMES.map(g => <option key={g} value={g} style={{ background: '#111' }}>{g}</option>)}
                                                </select>
                                                {game === 'Other' && <OtherInput value={gameOther} onChange={setGameOther} required />}
                                            </FieldBlock>
                                        )}
                                        <FieldBlock label='MOD LINK' hint='If related to a specific mod (optional)'>
                                            <input value={modLink} onChange={e => setModLink(e.target.value)} placeholder='Workshop URL (optional)' style={INPUT_STYLE} />
                                        </FieldBlock>
                                    </>
                                )}

                                {subtype === 'bug-other' && (
                                    <FieldBlock label='PLATFORM / CONTEXT' hint='Where does this bug occur?' required>
                                        <input value={bugOtherDetail} onChange={e => setBugOtherDetail(e.target.value)} placeholder='Describe which system or context…' required style={INPUT_STYLE} />
                                    </FieldBlock>
                                )}

                                <FieldBlock label='DESCRIPTION' hint='What went wrong?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={TA_STYLE} placeholder='Describe the bug clearly — what happened and in what context.' />
                                </FieldBlock>
                                <FieldBlock label='STEPS TO REPRODUCE'>
                                    <textarea value={stepsToReproduce} onChange={e => setStepsToReproduce(e.target.value)} rows={4} style={TA_STYLE} placeholder={'1. Navigate to…\n2. Click / press…\n3. Observe…'} />
                                </FieldBlock>
                                <FieldBlock label='EXPECTED RESULT'>
                                    <input value={expectedResult} onChange={e => setExpectedResult(e.target.value)} placeholder='What should happen?' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='ACTUAL RESULT'>
                                    <input value={actualResult} onChange={e => setActualResult(e.target.value)} placeholder='What actually happens?' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='SEVERITY'>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['low', 'medium', 'high', 'critical'] as const).map(s => {
                                            const col = s === 'low' ? 'rgba(74,222,128,0.8)' : s === 'medium' ? 'rgba(255,160,0,0.85)' : s === 'high' ? 'rgba(219,0,29,0.85)' : 'rgba(255,0,0,0.95)'
                                            return (
                                                <button key={s} type='button' onClick={() => setSeverity(s)} style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', background: severity === s ? `${col}18` : 'transparent', border: `1px solid ${severity === s ? col : 'rgba(255,255,255,0.1)'}`, color: severity === s ? col : GUIDANCE_TEXT_COLOR, cursor: 'pointer', textTransform: 'uppercase' }}>
                                                    {s}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: GUIDANCE_TEXT_COLOR, marginTop: 6, lineHeight: 1.5 }}>
                                        Low = minor inconvenience · Medium = impairs workflow · High = blocks play · Critical = game-breaking / data loss
                                    </div>
                                </FieldBlock>
                            </>
                        )}

                        {/* ── MISSION ── */}
                        {subtype === 'mission' && (
                            <>
                                {/* Section 1 — Basic Details */}
                                <SectionBlock title='Basic Details' num={1} colors={SECT.basicDetails}>
                                    <SubField label='MISSION NAME' hint='Operation title'>
                                        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder='e.g. Operation Iron Compass…' style={INPUT_STYLE} />
                                        <CharCount n={title.length} max={100} />
                                    </SubField>
                                    <SubField label='MISSION TYPE'>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {MISSION_TYPES.map(t => (
                                                <button key={t.value} type='button' onClick={() => setMissionType(t.value as 'midweek' | 'weekend')} style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', background: missionType === t.value ? 'rgba(0,195,255,0.1)' : 'transparent', border: `1px solid ${missionType === t.value ? 'rgba(0,195,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: missionType === t.value ? 'rgba(0,195,255,0.9)' : GUIDANCE_TEXT_COLOR, cursor: 'pointer' }}>
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </SubField>
                                    <SubField label='OVERVIEW / CONCEPT' hint='Brief summary of the mission'>
                                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={TA_STYLE} placeholder='Brief summary of the mission concept, setting, and scale.' />
                                    </SubField>
                                    <SubField label='MAP / TERRAIN IDEAS' hint='Include workshop links if applicable'>
                                        <textarea value={missionMap} onChange={e => setMissionMap(e.target.value)} rows={2} style={TA_STYLE} placeholder='Preferred terrain, map name, or workshop link…' />
                                    </SubField>
                                    <SubField label='ERA / TIME PERIOD' hint='Modern, Cold War, WWII, Fictional, etc.'>
                                        <input value={missionEra} onChange={e => setMissionEra(e.target.value)} style={INPUT_STYLE} placeholder='e.g. Modern (2020s), Cold War, WWII — Eastern Front…' />
                                    </SubField>
                                    <SubField label='MOD SUGGESTIONS' hint='Factions, assets, features'>
                                        <textarea value={missionModSuggestions} onChange={e => setMissionModSuggestions(e.target.value)} rows={2} style={TA_STYLE} placeholder='Specific mods, factions, or assets needed…' />
                                    </SubField>
                                    <SubField label='MISSION STYLE'>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {['Linear / Story', 'Dynamic / Sandbox', 'Mixed'].map(s => (
                                                <button key={s} type='button' onClick={() => setMissionStyle(s)} style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', background: missionStyle === s ? 'rgba(55,80,105,0.25)' : 'transparent', border: `1px solid ${missionStyle === s ? 'rgba(100,140,180,0.5)' : 'rgba(255,255,255,0.1)'}`, color: missionStyle === s ? 'rgba(180,210,240,0.9)' : GUIDANCE_TEXT_COLOR, cursor: 'pointer' }}>
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </SubField>
                                </SectionBlock>

                                {/* Section 2 — Enemy Forces */}
                                <SectionBlock title='Enemy Forces' num={2} colors={SECT.enemy}>
                                    <SubField label='FACTION' hint='Who are they?'>
                                        <textarea value={enemyFaction} onChange={e => setEnemyFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Name and description of enemy faction…' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS' hint='Guerrilla, conventional, etc.'>
                                        <textarea value={enemyTactics} onChange={e => setEnemyTactics(e.target.value)} rows={3} style={TA_STYLE} placeholder='How do they fight? What are their objectives?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT' hint='Vehicles, aircraft, weapons, technology'>
                                        <textarea value={enemyAssets} onChange={e => setEnemyAssets(e.target.value)} rows={3} style={TA_STYLE} placeholder='List enemy vehicles, weapons systems, and key equipment…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={enemyNotes} onChange={e => setEnemyNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='Any additional notes about enemy forces…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 3 — Friendly Forces */}
                                <SectionBlock title='Friendly Forces' num={3} colors={SECT.friendly}>
                                    <SubField label='FACTION' hint='Who are we? Attachments?'>
                                        <textarea value={friendlyFaction} onChange={e => setFriendlyFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Player faction, callsign, and attachments…' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS'>
                                        <textarea value={friendlyTactics} onChange={e => setFriendlyTactics(e.target.value)} rows={3} style={TA_STYLE} placeholder='Friendly doctrine, approach, and plan…' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT' hint='Vehicles, aircraft, weapons, technology'>
                                        <textarea value={friendlyAssets} onChange={e => setFriendlyAssets(e.target.value)} rows={3} style={TA_STYLE} placeholder='Available vehicles, weapons, equipment for players…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={friendlyNotes} onChange={e => setFriendlyNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='Rules of engagement, restrictions, reinforcements…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 4 — Independent Forces */}
                                <SectionBlock title='Independent Forces' num={4} colors={SECT.independent}>
                                    <SubField label='FACTION'>
                                        <textarea value={indepenFaction} onChange={e => setIndepenFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Third-party faction (militia, police, PMC, etc.)…' />
                                    </SubField>
                                    <SubField label='RELATIONSHIP' hint='Supportive or hostile?'>
                                        <textarea value={indepenRelationship} onChange={e => setIndepenRelationship(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do they relate to players and enemy forces?' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS'>
                                        <textarea value={indepenTactics} onChange={e => setIndepenTactics(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do they behave on the battlefield?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT'>
                                        <textarea value={indepenAssets} onChange={e => setIndepenAssets(e.target.value)} rows={2} style={TA_STYLE} placeholder='Their vehicles and weapons…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={indepenNotes} onChange={e => setIndepenNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='N/A if no independent forces present…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 5 — Civilian Populace */}
                                <SectionBlock title='Civilian Populace' num={5} colors={SECT.civilian}>
                                    <SubField label='FACTION'>
                                        <textarea value={civFaction} onChange={e => setCivFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Who are the civilians? Are they a specific group?' />
                                    </SubField>
                                    <SubField label='RELATIONSHIP' hint='Supportive, hostile, or neutral?'>
                                        <textarea value={civRelationship} onChange={e => setCivRelationship(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do civilians relate to players?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT'>
                                        <textarea value={civAssets} onChange={e => setCivAssets(e.target.value)} rows={2} style={TA_STYLE} placeholder='Vehicles, infrastructure, notable items…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={civNotes} onChange={e => setCivNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='CIVCAS rules, civilian presence impact on objectives…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 6 — Mission Theme & Story */}
                                <SectionBlock title='Mission Theme & Story' num={6} colors={SECT.storyTheme}>
                                    <SubField label='OVERALL STORY' hint='How is story delivered to players?'>
                                        <textarea value={missionStoryOverall} onChange={e => setMissionStoryOverall(e.target.value)} rows={4} style={TA_STYLE} placeholder='Describe the narrative. How do players receive it — briefings, in-game events, radio comms?' />
                                    </SubField>
                                    <SubField label='HISTORICAL / FICTIONAL INSPIRATION'>
                                        <textarea value={missionHistoricalInspiration} onChange={e => setMissionHistoricalInspiration(e.target.value)} rows={3} style={TA_STYLE} placeholder='Real events, films, games, or fiction that inspired this mission…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 7 — Objectives & Intel */}
                                <SectionBlock title='Objectives & Intel' num={7} colors={SECT.objectives}>
                                    <SubField label='OBJECTIVE IDEAS' hint='What is realistic? Why are we doing this?'>
                                        <textarea value={missionObjectiveIdeas} onChange={e => setMissionObjectiveIdeas(e.target.value)} rows={4} style={TA_STYLE} placeholder={'Primary objectives, secondary objectives…\nWhat is realistic given the force composition?\nWhy are we doing this — strategic rationale?'} />
                                    </SubField>
                                    <SubField label='DESIRED PLAYER EXPERIENCE' hint='How should players feel and play?'>
                                        <textarea value={missionPlayerExp} onChange={e => setMissionPlayerExp(e.target.value)} rows={3} style={TA_STYLE} placeholder='Tense and methodical? Fast-paced assault? Desperate defence? Describe the intended feeling…' />
                                    </SubField>
                                    <SubField label='INTELLIGENCE & EVENTS' hint='How is information discovered and shared?'>
                                        <textarea value={missionIntelEvents} onChange={e => setMissionIntelEvents(e.target.value)} rows={3} style={TA_STYLE} placeholder='How do players learn new information? Scripted events, radio, physical intel items?' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 8 — Additional Notes */}
                                <SectionBlock title='Additional Notes' num={8} colors={SECT.additionalNotes}>
                                    <SubField label='UNIQUE FEATURES / MECHANICS'>
                                        <textarea value={missionUniqueMechanics} onChange={e => setMissionUniqueMechanics(e.target.value)} rows={3} style={TA_STYLE} placeholder='Special scripts, triggers, custom systems, or unique gameplay mechanics…' />
                                    </SubField>
                                    <SubField label='ATMOSPHERE & IMMERSION' hint='Music, sounds, cutscenes, intros/outros'>
                                        <textarea value={missionAtmosphere} onChange={e => setMissionAtmosphere(e.target.value)} rows={3} style={TA_STYLE} placeholder='Time of day, weather, ambient sounds, opening/closing cutscenes…' />
                                    </SubField>
                                    <SubField label='SPECIAL REQUIREMENTS' hint='Restrictions or conditions'>
                                        <textarea value={missionSpecialRequirements} onChange={e => setMissionSpecialRequirements(e.target.value)} rows={2} style={TA_STYLE} placeholder='e.g. no armour, night ops only, specific player count, no AI…' />
                                    </SubField>
                                    <SubField label='FINAL COMMENTS'>
                                        <textarea value={missionFinalComments} onChange={e => setMissionFinalComments(e.target.value)} rows={3} style={TA_STYLE} placeholder='Anything else J2 should know about this submission…' />
                                    </SubField>
                                </SectionBlock>
                            </>
                        )}

                        {/* ── CAMPAIGN ── */}
                        {subtype === 'campaign' && (
                            <>
                                {/* Section 1 — Basic Details */}
                                <SectionBlock title='Basic Details' num={1} colors={SECT.basicDetails}>
                                    <SubField label='CAMPAIGN NAME' hint='Overall campaign title'>
                                        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder='e.g. Operation Crimson Horizon…' style={INPUT_STYLE} />
                                        <CharCount n={title.length} max={100} />
                                    </SubField>
                                    <SubField label='CAMPAIGN OVERVIEW / CONCEPT'>
                                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} style={TA_STYLE} placeholder='Overall narrative arc, setting, scope, and how missions connect…' />
                                    </SubField>
                                    <SubField label='MAP / TERRAIN IDEAS' hint='Include workshop links if applicable'>
                                        <textarea value={missionMap} onChange={e => setMissionMap(e.target.value)} rows={2} style={TA_STYLE} placeholder='Preferred terrain, map name, or workshop link…' />
                                    </SubField>
                                    <SubField label='ERA / TIME PERIOD' hint='Modern, Cold War, WWII, Fictional, etc.'>
                                        <input value={missionEra} onChange={e => setMissionEra(e.target.value)} style={INPUT_STYLE} placeholder='e.g. Modern (2020s), Cold War, WWII — Eastern Front…' />
                                    </SubField>
                                    <SubField label='MOD SUGGESTIONS' hint='Factions, assets, features'>
                                        <textarea value={missionModSuggestions} onChange={e => setMissionModSuggestions(e.target.value)} rows={2} style={TA_STYLE} placeholder='Specific mods, factions, or assets needed across the campaign…' />
                                    </SubField>
                                    <SubField label='MISSION STYLE'>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {['Linear / Story', 'Dynamic / Sandbox', 'Mixed'].map(s => (
                                                <button key={s} type='button' onClick={() => setMissionStyle(s)} style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', background: missionStyle === s ? 'rgba(55,80,105,0.25)' : 'transparent', border: `1px solid ${missionStyle === s ? 'rgba(100,140,180,0.5)' : 'rgba(255,255,255,0.1)'}`, color: missionStyle === s ? 'rgba(180,210,240,0.9)' : GUIDANCE_TEXT_COLOR, cursor: 'pointer' }}>
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </SubField>
                                </SectionBlock>

                                {/* Section 2 — Enemy Forces */}
                                <SectionBlock title='Enemy Forces' num={2} colors={SECT.enemy}>
                                    <SubField label='FACTION' hint='Who are they?'>
                                        <textarea value={enemyFaction} onChange={e => setEnemyFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Name and description of enemy faction…' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS' hint='Guerrilla, conventional, etc.'>
                                        <textarea value={enemyTactics} onChange={e => setEnemyTactics(e.target.value)} rows={3} style={TA_STYLE} placeholder='How do they fight? What are their objectives?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT' hint='Vehicles, aircraft, weapons, technology'>
                                        <textarea value={enemyAssets} onChange={e => setEnemyAssets(e.target.value)} rows={3} style={TA_STYLE} placeholder='List enemy vehicles, weapons systems, and key equipment…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={enemyNotes} onChange={e => setEnemyNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='Any additional notes about enemy forces…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 3 — Friendly Forces */}
                                <SectionBlock title='Friendly Forces' num={3} colors={SECT.friendly}>
                                    <SubField label='FACTION' hint='Who are we? Attachments?'>
                                        <textarea value={friendlyFaction} onChange={e => setFriendlyFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Player faction, callsign, and attachments…' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS'>
                                        <textarea value={friendlyTactics} onChange={e => setFriendlyTactics(e.target.value)} rows={3} style={TA_STYLE} placeholder='Friendly doctrine, approach, and plan…' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT' hint='Vehicles, aircraft, weapons, technology'>
                                        <textarea value={friendlyAssets} onChange={e => setFriendlyAssets(e.target.value)} rows={3} style={TA_STYLE} placeholder='Available vehicles, weapons, equipment for players…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={friendlyNotes} onChange={e => setFriendlyNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='Rules of engagement, restrictions, reinforcements…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 4 — Independent Forces */}
                                <SectionBlock title='Independent Forces' num={4} colors={SECT.independent}>
                                    <SubField label='FACTION'>
                                        <textarea value={indepenFaction} onChange={e => setIndepenFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Third-party faction (militia, police, PMC, etc.)…' />
                                    </SubField>
                                    <SubField label='RELATIONSHIP' hint='Supportive or hostile?'>
                                        <textarea value={indepenRelationship} onChange={e => setIndepenRelationship(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do they relate to players and enemy forces?' />
                                    </SubField>
                                    <SubField label='TACTICS & INTENTIONS'>
                                        <textarea value={indepenTactics} onChange={e => setIndepenTactics(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do they behave on the battlefield?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT'>
                                        <textarea value={indepenAssets} onChange={e => setIndepenAssets(e.target.value)} rows={2} style={TA_STYLE} placeholder='Their vehicles and weapons…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={indepenNotes} onChange={e => setIndepenNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='N/A if no independent forces present…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 5 — Civilian Populace */}
                                <SectionBlock title='Civilian Populace' num={5} colors={SECT.civilian}>
                                    <SubField label='FACTION'>
                                        <textarea value={civFaction} onChange={e => setCivFaction(e.target.value)} rows={2} style={TA_STYLE} placeholder='Who are the civilians?' />
                                    </SubField>
                                    <SubField label='RELATIONSHIP' hint='Supportive, hostile, or neutral?'>
                                        <textarea value={civRelationship} onChange={e => setCivRelationship(e.target.value)} rows={2} style={TA_STYLE} placeholder='How do civilians relate to players?' />
                                    </SubField>
                                    <SubField label='ASSETS & EQUIPMENT'>
                                        <textarea value={civAssets} onChange={e => setCivAssets(e.target.value)} rows={2} style={TA_STYLE} placeholder='Vehicles, infrastructure, notable items…' />
                                    </SubField>
                                    <SubField label='OTHER NOTES'>
                                        <textarea value={civNotes} onChange={e => setCivNotes(e.target.value)} rows={2} style={TA_STYLE} placeholder='CIVCAS rules, civilian presence impact on objectives…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 6 — Mission Theme & Story */}
                                <SectionBlock title='Mission Theme & Story' num={6} colors={SECT.storyTheme}>
                                    <SubField label='OVERALL STORY' hint='How is story delivered across the campaign?'>
                                        <textarea value={missionStoryOverall} onChange={e => setMissionStoryOverall(e.target.value)} rows={4} style={TA_STYLE} placeholder='Overall narrative. How do players receive the story — briefings, events, radio comms?' />
                                    </SubField>
                                    <SubField label='HISTORICAL / FICTIONAL INSPIRATION'>
                                        <textarea value={missionHistoricalInspiration} onChange={e => setMissionHistoricalInspiration(e.target.value)} rows={3} style={TA_STYLE} placeholder='Real events, films, games, or fiction that inspired this campaign…' />
                                    </SubField>
                                </SectionBlock>

                                {/* Section 7 — Objectives & Intel (multi-mission) */}
                                <div style={{ marginBottom: 10 }}>
                                    {campaignMissions.map((m, i) => (
                                        <SectionBlock key={i} title={`Objectives & Intel — Mission ${i + 1}`} num={7} colors={SECT.objectives}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                                                {campaignMissions.length > 3 && (
                                                    <button type='button' onClick={() => setCampaignMissions(ms => ms.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'rgba(219,0,29,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', padding: 0 }}>
                                                        <Delete style={{ fontSize: 13 }} /> Remove
                                                    </button>
                                                )}
                                            </div>
                                            <SubField label='OBJECTIVE IDEAS' hint='What is realistic? Why are we doing this?'>
                                                <textarea value={m.objectiveIdeas} onChange={e => setCampaignMissions(ms => ms.map((x, j) => j === i ? { ...x, objectiveIdeas: e.target.value } : x))} rows={3} style={TA_STYLE} placeholder={'Primary and secondary objectives…\nStrategic rationale for this mission…'} />
                                            </SubField>
                                            <SubField label='DESIRED PLAYER EXPERIENCE' hint='How should players feel and play?'>
                                                <textarea value={m.playerExperience} onChange={e => setCampaignMissions(ms => ms.map((x, j) => j === i ? { ...x, playerExperience: e.target.value } : x))} rows={2} style={TA_STYLE} placeholder='Tense assault? Methodical advance? Desperate defence?…' />
                                            </SubField>
                                            <SubField label='INTELLIGENCE & EVENTS' hint='How is information discovered and shared?'>
                                                <textarea value={m.intelEvents} onChange={e => setCampaignMissions(ms => ms.map((x, j) => j === i ? { ...x, intelEvents: e.target.value } : x))} rows={2} style={TA_STYLE} placeholder='Scripted events, radio, physical intel items?' />
                                            </SubField>
                                        </SectionBlock>
                                    ))}
                                    <button type='button' onClick={() => setCampaignMissions(ms => [...ms, { objectiveIdeas: '', playerExperience: '', intelEvents: '' }])} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px dashed ${SECT.objectives.border}`, padding: '8px 14px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(200,130,80,0.65)', width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                                        <Add style={{ fontSize: 14 }} /> ADD MORE MISSIONS
                                    </button>
                                </div>

                                {/* Section 8 — Additional Notes */}
                                <SectionBlock title='Additional Notes' num={8} colors={SECT.additionalNotes}>
                                    <SubField label='UNIQUE FEATURES / MECHANICS'>
                                        <textarea value={missionUniqueMechanics} onChange={e => setMissionUniqueMechanics(e.target.value)} rows={3} style={TA_STYLE} placeholder='Special scripts, triggers, custom systems, or unique gameplay mechanics…' />
                                    </SubField>
                                    <SubField label='ATMOSPHERE & IMMERSION' hint='Music, sounds, cutscenes, intros/outros'>
                                        <textarea value={missionAtmosphere} onChange={e => setMissionAtmosphere(e.target.value)} rows={3} style={TA_STYLE} placeholder='Time of day, weather, ambient sounds, opening/closing cutscenes…' />
                                    </SubField>
                                    <SubField label='SPECIAL REQUIREMENTS' hint='Restrictions or conditions'>
                                        <textarea value={missionSpecialRequirements} onChange={e => setMissionSpecialRequirements(e.target.value)} rows={2} style={TA_STYLE} placeholder='e.g. no armour, night ops only, specific player count…' />
                                    </SubField>
                                    <SubField label='FINAL COMMENTS'>
                                        <textarea value={missionFinalComments} onChange={e => setMissionFinalComments(e.target.value)} rows={3} style={TA_STYLE} placeholder='Anything else J2 should know about this campaign submission…' />
                                    </SubField>
                                </SectionBlock>
                            </>
                        )}

                        {/* ── UNIT FEEDBACK ── */}
                        {displayCat === 'unit-feedback' && (
                            <>
                                <FieldBlock label='TITLE' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={INPUT_STYLE} />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>
                                <FieldBlock label='FEEDBACK TYPE'>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['positive', 'neutral', 'negative'] as const).map(t => {
                                            const m = FB_TYPE_META[t]
                                            return (
                                                <button key={t} type='button' onClick={() => setFeedbackType(t)} style={{ padding: '6px 16px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', background: feedbackType === t ? `${m.color}18` : 'transparent', border: `1px solid ${feedbackType === t ? m.color : 'rgba(255,255,255,0.1)'}`, color: feedbackType === t ? m.color : GUIDANCE_TEXT_COLOR, cursor: 'pointer', textTransform: 'uppercase' }}>
                                                    {t}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </FieldBlock>
                                <FieldBlock label='CATEGORIES' hint='Select all that apply'>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {UNIT_FEEDBACK_CATS.map(c => {
                                            const active = feedbackCategories.includes(c)
                                            return (
                                                <button key={c} type='button' onClick={() => setFeedbackCategories(prev => active ? prev.filter(x => x !== c) : [...prev, c])} style={{ padding: '5px 10px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', background: active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`, color: active ? 'rgba(74,222,128,0.9)' : GUIDANCE_TEXT_COLOR, cursor: 'pointer' }}>
                                                    {c}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {feedbackCategories.includes('Other') && (
                                        <OtherInput value={feedbackCategoryOther} onChange={setFeedbackCategoryOther} required />
                                    )}
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={7} style={TA_STYLE} placeholder='Provide your feedback in detail.' />
                                </FieldBlock>
                                <FieldBlock label='ANONYMOUS SUBMISSION'>
                                    <ToggleSwitch on={isAnonymous} onChange={setIsAnonymous} label='Submit anonymously' />
                                </FieldBlock>
                            </>
                        )}

                        {/* ── COMPLAINT ── */}
                        {displayCat === 'complaint' && (
                            <>
                                <FieldBlock label='TITLE' hint='Brief subject of the complaint' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={INPUT_STYLE} />
                                </FieldBlock>

                                <FieldBlock label='YOUR IDENTITY'>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {/* Read-only identity — always shown, cannot be edited */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <Person style={{ fontSize: 14, color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.8)', flex: 1 }}>{myName || '…'}</span>
                                            <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.2)' }}>AUTO-FILLED</span>
                                        </div>
                                        <ToggleSwitch on={complainantAnonymous} onChange={setComplainantAnonymous} label='Remain anonymous' />
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                                <div onClick={() => setSubmitOnBehalf(v => !v)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, background: submitOnBehalf ? 'rgba(0,195,255,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${submitOnBehalf ? 'rgba(0,195,255,0.5)' : 'rgba(255,255,255,0.15)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {submitOnBehalf && <span style={{ color: 'rgba(0,195,255,0.9)', fontSize: 11, fontWeight: 800 }}>✓</span>}
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.5 }}>
                                                    Submit on behalf of another person
                                                </span>
                                            </label>
                                            {submitOnBehalf && (
                                                <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,195,255,0.04)', border: '1px solid rgba(0,195,255,0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(0,195,255,0.5)' }}>ON BEHALF OF</div>
                                                    <MemberSelect value={onBehalfMember} onChange={setOnBehalfMember} placeholder='Search member…' multi={false} />
                                                    <ToggleSwitch on={onBehalfAnonymous} onChange={setOnBehalfAnonymous} label='Keep their identity anonymous' />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </FieldBlock>

                                <FieldBlock label='MEMBER(S) INVOLVED' required>
                                    <div style={{ fontSize: '0.65rem', color: GUIDANCE_TEXT_COLOR, marginBottom: 8 }}>
                                        {subtype === 'complaint-individual' ? 'Search and select the member.' : subtype === 'complaint-group' ? 'Search and select all members involved.' : 'Enter the callsign or department name.'}
                                    </div>
                                    {subtype === 'complaint-department' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {/* Callsign picker from ORBAT */}
                                            <div>
                                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>CALLSIGN</div>
                                                <select
                                                    value={membersInvolved[0] ?? ''}
                                                    onChange={e => setMembersInvolved([e.target.value])}
                                                    style={SELECT_STYLE}
                                                >
                                                    <option value='' style={{ background: '#111' }}>Select callsign…</option>
                                                    {(() => {
                                                        const groups = Array.from(new Set(callsigns.map(c => c.group))).filter(Boolean)
                                                        const ungrouped = callsigns.filter(c => !c.group)
                                                        return [
                                                            ...groups.map(g => (
                                                                <optgroup key={g} label={g} style={{ background: '#111' }}>
                                                                    {callsigns.filter(c => c.group === g).map(c => (
                                                                        <option key={c.label} value={c.label} style={{ background: '#111' }}>{c.label}</option>
                                                                    ))}
                                                                </optgroup>
                                                            )),
                                                            ...ungrouped.map(c => (
                                                                <option key={c.label} value={c.label} style={{ background: '#111' }}>{c.label}</option>
                                                            )),
                                                        ]
                                                    })()}
                                                </select>
                                            </div>
                                            {/* Department picker */}
                                            <div>
                                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>OR — DEPARTMENT</div>
                                                <select
                                                    value={membersInvolved[0]?.startsWith('J') ? membersInvolved[0] : ''}
                                                    onChange={e => { if (e.target.value) setMembersInvolved([e.target.value]) }}
                                                    style={SELECT_STYLE}
                                                >
                                                    <option value='' style={{ background: '#111' }}>Select department…</option>
                                                    {[
                                                        'J1 — Recruitment',
                                                        'J2 — Mission Making',
                                                        'J3 — Training',
                                                        'J4 — Administration',
                                                        'J5 — Media',
                                                        'J6 — Game Masters',
                                                        'J7 — Development',
                                                    ].map(d => (
                                                        <option key={d} value={d} style={{ background: '#111' }}>{d}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {membersInvolved[0] && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.2)' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)', flex: 1 }}>{membersInvolved[0]}</span>
                                                    <button type='button' onClick={() => setMembersInvolved([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.5)', fontSize: '0.65rem', padding: 0 }}>✕ clear</button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <MemberSelect value={membersInvolved} onChange={setMembersInvolved} placeholder='Search member…' multi={subtype === 'complaint-group'} />
                                    )}
                                </FieldBlock>

                                <FieldBlock label='INVOLVES STAFF MEMBER'>
                                    <ToggleSwitch on={isStaffComplaint} onChange={setIsStaffComplaint} label='One or more people involved are staff' />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={7} style={TA_STYLE} placeholder='Describe the incident in detail. Include dates, context, and any witnesses.' />
                                </FieldBlock>
                                <FieldBlock label='DESIRED OUTCOME'>
                                    <textarea value={desiredOutcome} onChange={e => setDesiredOutcome(e.target.value)} rows={3} style={TA_STYLE} placeholder='What resolution are you hoping for?' />
                                </FieldBlock>

                                {/* Acknowledgement — intentionally last, before submit */}
                                <FieldBlock label='ACKNOWLEDGEMENT' required>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                        <div onClick={() => setEvidenceAcknowledged(v => !v)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, background: evidenceAcknowledged ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${evidenceAcknowledged ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.15)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {evidenceAcknowledged && <span style={{ color: 'rgba(74,222,128,0.9)', fontSize: 11, fontWeight: 800 }}>✓</span>}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: GUIDANCE_TEXT_COLOR, lineHeight: 1.5 }}>
                                            I acknowledge this complaint is confidential and reviewed by J4 only. I understand that submitting a false or frivolous complaint may result in disciplinary action.
                                        </span>
                                    </label>
                                </FieldBlock>
                            </>
                        )}

                        {/* ── AWARD NOMINATION ── */}
                        {displayCat === 'award' && subtype === 'award-nomination' && (
                            <>
                                {/* Nominee: single member selector (name + rank combined) */}
                                <FieldBlock label='NOMINEE' hint='Search member — rank is included in their profile' required>
                                    <MemberSelect value={nomineeNames} onChange={setNomineeNames} placeholder='Search nominee…' multi={false} />
                                </FieldBlock>
                                <FieldBlock label='NOMINATOR' hint='Who is submitting this nomination?'>
                                    <input value={nominatorName} onChange={e => setNominatorName(e.target.value)} placeholder='Your name or "Self"' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='SUPPORTING MEMBERS' hint='Optional — will be notified to confirm support'>
                                    <MemberSelect value={supportingMembers} onChange={setSupportingMembers} placeholder='Search supporters…' multi />
                                </FieldBlock>
                                <FieldBlock label='AWARD TYPE' hint='Which award are you nominating for?'>
                                    <select value={awardType} onChange={e => setAwardType(e.target.value)} style={SELECT_STYLE}>
                                        <option value='' style={{ background: '#111' }}>Select award…</option>
                                        <optgroup label='── SERVICE CITATIONS ──' style={{ background: '#111', color: 'rgba(237,237,237,0.35)', fontSize: '0.65rem' }}>
                                            <option value='1 Year Service Citation' style={{ background: '#111' }}>1 Year Service Citation</option>
                                            <option value='2 Year Service Citation' style={{ background: '#111' }}>2 Year Service Citation</option>
                                            <option value='3 Year Service Citation' style={{ background: '#111' }}>3 Year Service Citation</option>
                                            <option value='4 Year+ Service Citation' style={{ background: '#111' }}>4 Year+ Service Citation</option>
                                        </optgroup>
                                        <optgroup label='── NON-OPERATIONAL AWARDS ──' style={{ background: '#111', color: 'rgba(237,237,237,0.35)', fontSize: '0.65rem' }}>
                                            <option value='ASOT Beyond Award' style={{ background: '#111' }}>ASOT Beyond Award</option>
                                            <option value='Broken Lance Award' style={{ background: '#111' }}>Broken Lance Award</option>
                                            <option value='Diplomat Award' style={{ background: '#111' }}>Diplomat Award</option>
                                            <option value='Instructor Award' style={{ background: '#111' }}>Instructor Award</option>
                                            <option value='Public Relations Award' style={{ background: '#111' }}>Public Relations Award</option>
                                            <option value='Group Development Award' style={{ background: '#111' }}>Group Development Award</option>
                                            <option value='Architect Award' style={{ background: '#111' }}>Architect Award</option>
                                            <option value='Watchman Award' style={{ background: '#111' }}>Watchman Award</option>
                                            <option value='Atlas Award' style={{ background: '#111' }}>Atlas Award</option>
                                            <option value='Bronze Soldiers Medallion' style={{ background: '#111' }}>Bronze Soldiers Medallion</option>
                                            <option value='Silver Soldiers Medallion' style={{ background: '#111' }}>Silver Soldiers Medallion</option>
                                            <option value='Gold Soldiers Medallion' style={{ background: '#111' }}>Gold Soldiers Medallion</option>
                                            <option value='Founding Member' style={{ background: '#111' }}>Founding Member</option>
                                            <option value='Gallantry Award' style={{ background: '#111' }}>Gallantry Award</option>
                                            <option value='Star of Courage' style={{ background: '#111' }}>Star of Courage</option>
                                            <option value='ASOT Cross of Valour' style={{ background: '#111' }}>ASOT Cross of Valour</option>
                                            <option value='Protagonist Award' style={{ background: '#111' }}>Protagonist Award</option>
                                            <option value='Junior Leadership Award' style={{ background: '#111' }}>Junior Leadership Award</option>
                                            <option value='Senior Leadership Award' style={{ background: '#111' }}>Senior Leadership Award</option>
                                        </optgroup>
                                        <optgroup label='── MEMBER SKILL AWARDS ──' style={{ background: '#111', color: 'rgba(237,237,237,0.35)', fontSize: '0.65rem' }}>
                                            <option value='Rotary Aviation Medal' style={{ background: '#111' }}>Rotary Aviation Medal</option>
                                            <option value='Medical Medallion' style={{ background: '#111' }}>Medical Medallion</option>
                                        </optgroup>
                                        <optgroup label='── OPERATIONAL SERVICE CITATIONS ──' style={{ background: '#111', color: 'rgba(237,237,237,0.35)', fontSize: '0.65rem' }}>
                                            <option value='Campaign Medallion' style={{ background: '#111' }}>Campaign Medallion</option>
                                            <option value='Campaign Medallion, First Clasp' style={{ background: '#111' }}>Campaign Medallion, First Clasp</option>
                                            <option value='Campaign Medallion, Second Clasp' style={{ background: '#111' }}>Campaign Medallion, Second Clasp</option>
                                            <option value='Campaign Medallion, Third Clasp' style={{ background: '#111' }}>Campaign Medallion, Third Clasp</option>
                                            <option value='Campaign Medallion, Tier 2 First Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 2 First Clasp</option>
                                            <option value='Campaign Medallion, Tier 2 Second Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 2 Second Clasp</option>
                                            <option value='Campaign Medallion, Tier 2 Third Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 2 Third Clasp</option>
                                            <option value='Campaign Medallion, Tier 2 Fourth Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 2 Fourth Clasp</option>
                                            <option value='Campaign Medallion, Tier 3 First Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 3 First Clasp</option>
                                            <option value='Campaign Medallion, Tier 3 Second Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 3 Second Clasp</option>
                                            <option value='Campaign Medallion, Tier 3 Third Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 3 Third Clasp</option>
                                            <option value='Campaign Medallion, Tier 3 Fourth Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 3 Fourth Clasp</option>
                                            <option value='Campaign Medallion, Tier 4 First Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 4 First Clasp</option>
                                            <option value='Campaign Medallion, Tier 4 Second Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 4 Second Clasp</option>
                                            <option value='Campaign Medallion, Tier 4 Third Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 4 Third Clasp</option>
                                            <option value='Campaign Medallion, Tier 4 Fourth Clasp' style={{ background: '#111' }}>Campaign Medallion, Tier 4 Fourth Clasp</option>
                                        </optgroup>
                                    </select>
                                </FieldBlock>
                                <FieldBlock label='TITLE' hint='Brief nomination summary' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder='e.g. Nomination — Valour Cross — CPL Smith' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' hint='Why does this member deserve this award?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={8} style={TA_STYLE} placeholder='Be specific — describe the actions, contributions, or conduct that qualify this member. Vague nominations are harder to action.' />
                                </FieldBlock>
                            </>
                        )}

                        {/* ── AWARD CREATION ── */}
                        {displayCat === 'award' && subtype === 'award-creation' && (
                            <>
                                <FieldBlock label='PROPOSED NAME' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder='Award or citation name…' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='CATEGORY'>
                                    <select value={awardCategory} onChange={e => setAwardCategory(e.target.value)} style={SELECT_STYLE}>
                                        <option value='' style={{ background: '#111' }}>Select category…</option>
                                        {AWARD_CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#111' }}>{c}</option>)}
                                    </select>
                                    {awardCategory === 'Suggest New Category' && <OtherInput value={awardCategoryOther} onChange={setAwardCategoryOther} placeholder='Proposed category name…' required />}
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What does this award recognise?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={TA_STYLE} placeholder='Describe what behaviour, achievement, or service this award represents.' />
                                </FieldBlock>
                                <FieldBlock label='ELIGIBILITY & REQUIREMENTS'>
                                    <textarea value={awardRequirements} onChange={e => setAwardRequirements(e.target.value)} rows={5} style={TA_STYLE} placeholder={'Who is eligible?\nWhat actions or criteria are required?\nHow will it be awarded (nominated, automatic, CO discretion)?'} />
                                </FieldBlock>
                                <FieldBlock label='DESIGN REFERENCE' hint='Image link, inspiration URL (optional)'>
                                    <input value={awardDesignRef} onChange={e => setAwardDesignRef(e.target.value)} placeholder='https://…' style={INPUT_STYLE} />
                                </FieldBlock>
                                <FieldBlock label='DESIGN NOTES' hint='Colour, style, layout — reference the examples in the left panel'>
                                    <textarea value={awardDesignNotes} onChange={e => setAwardDesignNotes(e.target.value)} rows={4} style={TA_STYLE} placeholder={'Ribbon colours:\nMedal style:\nInspiration or reference awards:'} />
                                </FieldBlock>
                            </>
                        )}

                        {/* ── MEDIA (all) ── */}
                        <FieldBlock label='MEDIA' hint='Drag & drop or click to upload images · video links · reference URLs'>
                            <MediaUpload media={media} onChange={setMedia} />
                        </FieldBlock>

                        <FieldBlock label='OTHER COMMENTS' hint='Optional — anything not covered above'>
                            <textarea value={otherComments} onChange={e => setOtherComments(e.target.value)} rows={3} style={TA_STYLE} />
                        </FieldBlock>

                        {error && (
                            <div style={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.85)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '3px solid rgba(219,0,29,0.7)', padding: '8px 12px', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Warning style={{ fontSize: 14 }} /> {error}
                            </div>
                        )}

                        <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid rgba(219,0,29,0.4)', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.22)', letterSpacing: '0.06em' }}>
                                    {catDef?.label.toUpperCase()}{' // '}{subtypeDef?.label.toUpperCase()}
                                </div>
                                {title && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{title}</div>}
                            </div>
                            <button type='submit' disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: 8, background: submitting ? 'rgba(219,0,29,0.06)' : 'rgba(219,0,29,0.14)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(219,0,29,0.95)', padding: '10px 28px', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.14em', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, flexShrink: 0 }}>
                                {submitting ? <><CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.7)' }} /> SUBMITTING…</> : 'SUBMIT TICKET'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
        </>
    )
}


