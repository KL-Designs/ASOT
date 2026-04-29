'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowBack, ArrowForward, Add, Delete, BugReport, Lightbulb,
    Map, Campaign, Feedback, ReportProblem, EmojiEvents, Warning,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

const DRAFT_KEY = 'community_ticket_draft'
const DEBOUNCE_MS = 800

const ASOT_GAMES = ['Arma 3', 'Arma Reforger', 'Squad', 'Hell Let Loose', 'Ground Branch', 'SCUM', 'Other']
const FEATURE_CATEGORIES = ['Arma', 'Discord', 'Website', 'Milpack', 'TeamSpeak', 'Other Game', 'Other']
const UNIT_FEEDBACK_CATS = [
    'Recruitment', 'BCT', 'Training', 'Discord', 'TeamSpeak',
    'ORBAT / Callsigns', 'Mods', 'Gameplay', 'Planning',
    'Medical', 'Operations', 'Midweek', 'Chaplain', 'Other',
]

type Category = 'request' | 'bug' | 'mission' | 'campaign' | 'unit-feedback' | 'complaint' | 'award'
type Step = 'category' | 'subtype' | 'form'
type SimilarTicket = { _id: string; title: string; category: string; subtype: string; status: string }

const CATEGORY_DEFS: { value: Category; label: string; icon: React.ReactNode; desc: string; color: string; isPrivate?: boolean }[] = [
    { value: 'request', label: 'Request', icon: <Lightbulb />, desc: 'Mod or feature requests for the unit.', color: 'rgba(255,160,0,0.85)' },
    { value: 'bug', label: 'Bug Report', icon: <BugReport />, desc: 'Report a broken or unexpected behaviour.', color: 'rgba(219,0,29,0.85)' },
    { value: 'mission', label: 'Mission Idea', icon: <Map />, desc: 'Pitch a mission idea to J2.', color: 'rgba(0,195,255,0.85)' },
    { value: 'campaign', label: 'Campaign Idea', icon: <Campaign />, desc: 'Pitch a multi-mission campaign to J2.', color: 'rgba(167,139,250,0.9)' },
    { value: 'unit-feedback', label: 'Unit Feedback', icon: <Feedback />, desc: 'Private feedback sent directly to J4.', color: 'rgba(74,222,128,0.85)', isPrivate: true },
    { value: 'complaint', label: 'Complaint', icon: <ReportProblem />, desc: 'Report an issue involving a member. Private.', color: 'rgba(255,80,80,0.85)', isPrivate: true },
    { value: 'award', label: 'Award', icon: <EmojiEvents />, desc: 'Nominate a member or propose a new award.', color: 'rgba(255,200,0,0.9)', isPrivate: true },
]

const SUBTYPES: Record<Category, { value: string; label: string; desc: string }[]> = {
    request: [
        { value: 'mod-request', label: 'Mod Request', desc: 'Request an Arma 3 mod to be added.' },
        { value: 'feature-request', label: 'Feature Request', desc: 'Request a new feature for any platform.' },
    ],
    bug: [
        { value: 'bug-arma', label: 'Arma 3', desc: 'In-game issue.' },
        { value: 'bug-discord', label: 'Discord', desc: 'Channel, role, or permission issue.' },
        { value: 'bug-website', label: 'Website', desc: 'Bug on this website.' },
        { value: 'bug-milpack', label: 'Milpack', desc: 'Bug in the milpack system.' },
        { value: 'bug-teamspeak', label: 'TeamSpeak', desc: 'Role or permission issue on TS.' },
        { value: 'bug-other-game', label: 'Other Game', desc: 'Bug in another ASOT game.' },
        { value: 'bug-other', label: 'Other', desc: 'Something else.' },
    ],
    mission: [{ value: 'mission', label: 'Mission Idea', desc: 'A standalone mission pitch.' }],
    campaign: [{ value: 'campaign', label: 'Campaign Idea', desc: 'A multi-mission campaign pitch (min. 3 missions).' }],
    'unit-feedback': [{ value: 'unit-feedback', label: 'Unit Feedback', desc: 'Feedback for J4 (private).' }],
    complaint: [
        { value: 'complaint-individual', label: 'Individual', desc: 'Complaint about a specific member.' },
        { value: 'complaint-group', label: 'Group', desc: 'Complaint about multiple members.' },
        { value: 'complaint-department', label: 'Callsign / Dept', desc: 'Complaint about a department or callsign.' },
    ],
    award: [
        { value: 'award-nomination', label: 'Nomination', desc: 'Nominate a member for an award.' },
        { value: 'award-creation', label: 'Award Idea', desc: 'Propose a new award.' },
    ],
}

function getSingleSubtype(cat: Category): string | null {
    const list = SUBTYPES[cat]
    return list.length === 1 ? list[0].value : null
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(237,237,237,0.88)', fontSize: '0.85rem', outline: 'none',
    boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit',
}

const taStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', minHeight: 120 }


function FieldBlock({ label, hint, required, children }: {
    label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.5)' }}>{label}</span>
                {required && <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.7)', fontWeight: 700 }}>*</span>}
                {hint && <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>— {hint}</span>}
            </div>
            {children}
        </div>
    )
}

function SimilarityWarning({ items, level }: { items: SimilarTicket[]; level: 'soft' | 'strong' }) {
    if (items.length === 0) return null
    const bg = level === 'strong' ? 'rgba(219,0,29,0.08)' : 'rgba(255,160,0,0.06)'
    const border = level === 'strong' ? 'rgba(219,0,29,0.35)' : 'rgba(255,160,0,0.3)'
    const col = level === 'strong' ? 'rgba(219,0,29,0.9)' : 'rgba(255,160,0,0.85)'
    return (
        <div style={{ background: bg, border: `1px solid ${border}`, borderLeft: `3px solid ${col}`, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: col, marginBottom: 6 }}>
                {level === 'strong' ? '⚠ STRONG SIMILARITY DETECTED' : 'SIMILAR TICKETS FOUND'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', marginBottom: 8 }}>
                {level === 'strong'
                    ? 'Your submission is very similar to existing tickets. Please review them before continuing.'
                    : 'This looks similar to existing tickets. Please check these before submitting.'}
            </div>
            {items.map(t => (
                <Link key={t._id} href={`/community/tickets/${t._id}`} target='_blank' style={{ display: 'block', marginBottom: 4 }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(0,195,255,0.8)', textDecoration: 'underline' }}>{t.title}</div>
                </Link>
            ))}
        </div>
    )
}


export default function NewTicketPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('category')
    const [category, setCategory] = useState<Category | null>(null)
    const [subtype, setSubtype] = useState<string | null>(null)

    // Form state
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [justification, setJustification] = useState('')
    const [otherComments, setOtherComments] = useState('')
    const [isAnonymous, setIsAnonymous] = useState(false)

    // Request fields
    const [modLink, setModLink] = useState('')
    const [game, setGame] = useState('')
    const [gameOther, setGameOther] = useState('')
    const [featureCategory, setFeatureCategory] = useState('')
    const [weblink, setWeblink] = useState('')

    // Bug fields
    const [stepsToReproduce, setStepsToReproduce] = useState('')
    const [expectedResult, setExpectedResult] = useState('')
    const [actualResult, setActualResult] = useState('')
    const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('low')
    const [bugPlatformDetail, setBugPlatformDetail] = useState('')

    // Mission fields
    const [missionForces, setMissionForces] = useState('')
    const [missionObjectives, setMissionObjectives] = useState('')
    const [missionStory, setMissionStory] = useState('')
    const [missionPlayerExp, setMissionPlayerExp] = useState('')
    const [missionMechanics, setMissionMechanics] = useState('')

    // Campaign: phases
    const [phases, setPhases] = useState<{ title: string; description: string }[]>([
        { title: '', description: '' }, { title: '', description: '' }, { title: '', description: '' },
    ])

    // Unit feedback
    const [feedbackCategories, setFeedbackCategories] = useState<string[]>([])
    const [feedbackType, setFeedbackType] = useState<'positive' | 'neutral' | 'negative'>('neutral')

    // Complaint
    const [complainantName, setComplainantName] = useState('')
    const [membersInvolved, setMembersInvolved] = useState('')
    const [isStaffComplaint, setIsStaffComplaint] = useState(false)
    const [desiredOutcome, setDesiredOutcome] = useState('')
    const [evidenceAcknowledged, setEvidenceAcknowledged] = useState(false)

    // Award
    const [nomineeName, setNomineeName] = useState('')
    const [nomineeRank, setNomineeRank] = useState('')
    const [nominatorName, setNominatorName] = useState('')
    const [awardType, setAwardType] = useState('')
    const [awardCategory, setAwardCategory] = useState('')
    const [awardRequirements, setAwardRequirements] = useState('')
    const [awardDesignRef, setAwardDesignRef] = useState('')

    // Duplicate / similarity
    const [similar, setSimilar] = useState<SimilarTicket[]>([])
    const [modDuplicate, setModDuplicate] = useState<string | null>(null)

    // UI
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [draftSaved, setDraftSaved] = useState(false)
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Load draft on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY)
            if (!raw) return
            const d = JSON.parse(raw)
            if (d.category) { setCategory(d.category); setStep('subtype') }
            if (d.subtype) { setSubtype(d.subtype); setStep('form') }
            if (d.title) setTitle(d.title)
            if (d.description) setDescription(d.description)
            if (d.justification) setJustification(d.justification)
            if (d.modLink) setModLink(d.modLink)
            if (d.game) setGame(d.game)
            if (d.featureCategory) setFeatureCategory(d.featureCategory)
            if (d.weblink) setWeblink(d.weblink)
            if (d.stepsToReproduce) setStepsToReproduce(d.stepsToReproduce)
            if (d.expectedResult) setExpectedResult(d.expectedResult)
            if (d.actualResult) setActualResult(d.actualResult)
            if (d.severity) setSeverity(d.severity)
            if (d.bugPlatformDetail) setBugPlatformDetail(d.bugPlatformDetail)
            if (d.missionForces) setMissionForces(d.missionForces)
            if (d.missionObjectives) setMissionObjectives(d.missionObjectives)
            if (d.missionStory) setMissionStory(d.missionStory)
            if (d.missionPlayerExp) setMissionPlayerExp(d.missionPlayerExp)
            if (d.missionMechanics) setMissionMechanics(d.missionMechanics)
            if (d.phases) setPhases(d.phases)
            if (d.feedbackCategories) setFeedbackCategories(d.feedbackCategories)
            if (d.feedbackType) setFeedbackType(d.feedbackType)
            if (d.otherComments) setOtherComments(d.otherComments)
        } catch { /* ignore */ }
    }, [])

    // Auto-save draft
    const saveDraft = useCallback(() => {
        if (!category) return
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                category, subtype, title, description, justification, modLink, game, gameOther,
                featureCategory, weblink, stepsToReproduce, expectedResult, actualResult, severity,
                bugPlatformDetail, missionForces, missionObjectives, missionStory, missionPlayerExp,
                missionMechanics, phases, feedbackCategories, feedbackType, otherComments,
            }))
            setDraftSaved(true)
            setTimeout(() => setDraftSaved(false), 2000)
        } catch { /* ignore */ }
    }, [
        category, subtype, title, description, justification, modLink, game, gameOther,
        featureCategory, weblink, stepsToReproduce, expectedResult, actualResult, severity,
        bugPlatformDetail, missionForces, missionObjectives, missionStory, missionPlayerExp,
        missionMechanics, phases, feedbackCategories, feedbackType, otherComments,
    ])

    useEffect(() => {
        if (step !== 'form') return
        const t = setTimeout(saveDraft, DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [step, saveDraft])

    // Title similarity check
    useEffect(() => {
        if (!title.trim() || title.length < 6 || !category) return
        if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
        titleDebounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/community/tickets/similar?title=${encodeURIComponent(title)}&category=${category}`)
                const data = await res.json()
                setSimilar(Array.isArray(data) ? data : [])
            } catch { /* ignore */ }
        }, 600)
        return () => { if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current) }
    }, [title, category])

    // Mod link exact duplicate check
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

    function selectCategory(cat: Category) {
        setCategory(cat)
        setSubtype(null)
        const single = getSingleSubtype(cat)
        if (single) {
            setSubtype(single)
            setStep('form')
        } else {
            setStep('subtype')
        }
    }

    function selectSubtype(st: string) {
        setSubtype(st)
        setStep('form')
    }

    function clearDraft() {
        localStorage.removeItem(DRAFT_KEY)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (!category || !subtype) return
        if (!title.trim()) return setError('Title is required.')
        if (!description.trim()) return setError('Description is required.')
        if (subtype === 'mod-request' && !modLink.trim()) return setError('Mod link is required for mod requests.')
        if (category === 'complaint' && !evidenceAcknowledged) return setError('Please acknowledge the evidence policy.')
        if (category === 'campaign' && phases.filter(p => p.title.trim()).length < 3) return setError('Campaigns require at least 3 mission phases.')

        setSubmitting(true)
        const body: Record<string, unknown> = {
            category, subtype, title: title.trim(), description: description.trim(),
            isAnonymous,
            ...(justification && { justification }),
            ...(otherComments && { otherComments }),
            ...(modLink && { modLink }),
            ...(game && { game }),
            ...(gameOther && { gameOther }),
            ...(featureCategory && { featureCategory }),
            ...(weblink && { weblink }),
            ...(stepsToReproduce && { stepsToReproduce }),
            ...(expectedResult && { expectedResult }),
            ...(actualResult && { actualResult }),
            ...(severity && { severity }),
            ...(bugPlatformDetail && { bugPlatformDetail }),
            ...(missionForces && { missionForces }),
            ...(missionObjectives && { missionObjectives }),
            ...(missionStory && { missionStory }),
            ...(missionPlayerExp && { missionPlayerExperience: missionPlayerExp }),
            ...(missionMechanics && { missionMechanics }),
            ...(category === 'campaign' && { campaignPhases: phases.filter(p => p.title.trim()) }),
            ...(feedbackCategories.length > 0 && { feedbackCategories }),
            ...(feedbackType && { feedbackType }),
            ...(complainantName && { complainantName }),
            ...(membersInvolved && { membersInvolved: membersInvolved.split(',').map(s => s.trim()).filter(Boolean) }),
            ...(isStaffComplaint !== undefined && { isStaffComplaint }),
            ...(desiredOutcome && { desiredOutcome }),
            ...(evidenceAcknowledged !== undefined && { evidenceAcknowledged }),
            ...(nomineeName && { nomineeName }),
            ...(nomineeRank && { nomineeRank }),
            ...(nominatorName && { nominatorName }),
            ...(awardType && { awardType }),
            ...(awardCategory && { awardCategory }),
            ...(awardRequirements && { awardRequirements }),
            ...(awardDesignRef && { awardDesignRef }),
        }

        const res = await fetch('/api/community/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json()
        setSubmitting(false)

        if (!res.ok) {
            if (json.error === 'DUPLICATE_MOD') {
                setError(`This mod has already been suggested.`)
                setModDuplicate(json.existingId)
                return
            }
            setError(json.error ?? 'Submission failed.')
            return
        }

        clearDraft()
        router.push(`/community/tickets/${json._id}`)
    }

    const catDef = category ? CATEGORY_DEFS.find(c => c.value === category) : null
    const catColor = catDef?.color ?? 'rgba(237,237,237,0.5)'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Back */}
            <Link href='/community/tickets'>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0, marginBottom: 8,
                }}>
                    <ArrowBack style={{ fontSize: 14 }} /> BACK TO TICKETS
                </button>
            </Link>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
                {(['category', 'subtype', 'form'] as Step[]).map((s, i) => (
                    <React.Fragment key={s}>
                        <div style={{
                            padding: '5px 12px',
                            fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em',
                            background: step === s ? 'rgba(219,0,29,0.12)' : 'transparent',
                            border: `1px solid ${step === s ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.07)'}`,
                            color: step === s ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.25)',
                            cursor: step !== s && i < ['category', 'subtype', 'form'].indexOf(step) ? 'pointer' : 'default',
                        }}
                            onClick={() => {
                                if (s === 'category') setStep('category')
                                else if (s === 'subtype' && step === 'form' && category && SUBTYPES[category].length > 1) setStep('subtype')
                            }}
                        >
                            {String(i + 1).padStart(2, '0')} — {s.toUpperCase()}
                        </div>
                        {i < 2 && <ArrowForward style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />}
                    </React.Fragment>
                ))}
                {draftSaved && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'rgba(74,222,128,0.6)', letterSpacing: '0.1em', fontFamily: 'monospace' }}>
                        DRAFT SAVED
                    </span>
                )}
            </div>

            {/* ── STEP 1: CATEGORY ── */}
            {step === 'category' && (
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
                    <aside>
                        <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                                ASOT // PORTAL
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em' }}>
                                SUBMIT TICKET
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginTop: 3, lineHeight: 1.4 }}>
                                Select a category to begin.
                            </div>
                        </div>
                        <div style={{ padding: '10px 0', fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1.6 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.2)', marginBottom: 8 }}>NOTES</div>
                            Private categories are only visible to J4 staff.
                            <br /><br />
                            Your draft is auto-saved as you type.
                            <br /><br />
                            Search existing tickets before submitting to avoid duplicates.
                        </div>
                    </aside>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                        {CATEGORY_DEFS.map(cat => (
                            <button key={cat.value} onClick={() => selectCategory(cat.value)} style={{
                                background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.07)`,
                                borderTop: `2px solid ${cat.color}`,
                                padding: '20px 16px', cursor: 'pointer', textAlign: 'left',
                                transition: 'background 0.12s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                            >
                                <div style={{ color: cat.color, fontSize: '1.4rem', marginBottom: 10 }}>{cat.icon}</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.9)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {cat.label}
                                    {cat.isPrivate && <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.1em', padding: '1px 5px', color: 'rgba(255,80,80,0.7)', border: '1px solid rgba(255,80,80,0.2)' }}>PRIVATE</span>}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.4 }}>{cat.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── STEP 2: SUBTYPE ── */}
            {step === 'subtype' && category && (
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
                    <aside>
                        <div style={{ background: `${catColor}0d`, border: `1px solid ${catColor}33`, padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: catColor, marginBottom: 4 }}>
                                {`${catDef?.label.toUpperCase()} // TYPE`}
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em' }}>SELECT SUBTYPE</div>
                        </div>
                        <button onClick={() => setStep('category')} style={{
                            display: 'flex', alignItems: 'center', gap: 5, background: 'transparent',
                            border: 'none', color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                            fontSize: '0.7rem', fontWeight: 600, padding: '8px 2px',
                        }}>
                            <ArrowBack style={{ fontSize: 13 }} /> Change category
                        </button>
                    </aside>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {SUBTYPES[category].map(st => (
                            <button key={st.value} onClick={() => selectSubtype(st.value)} style={{
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                                borderLeft: `3px solid ${catColor}55`,
                                padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                                transition: 'background 0.12s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                            >
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', marginBottom: 3 }}>{st.label}</div>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>{st.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── STEP 3: FORM ── */}
            {step === 'form' && category && subtype && (
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
                    {/* Sidebar guidance */}
                    <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{ background: `${catColor}0d`, border: `1px solid ${catColor}33`, padding: '14px 16px', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: catColor, marginBottom: 4 }}>
                                {catDef?.label.toUpperCase()}
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.1em' }}>
                                {SUBTYPES[category].find(s => s.value === subtype)?.label}
                            </div>
                        </div>

                        <button onClick={() => setStep(category && SUBTYPES[category].length > 1 ? 'subtype' : 'category')} style={{
                            display: 'flex', alignItems: 'center', gap: 5, background: 'transparent',
                            border: 'none', color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                            fontSize: '0.7rem', fontWeight: 600, padding: '8px 2px', marginBottom: 8,
                        }}>
                            <ArrowBack style={{ fontSize: 13 }} /> Change type
                        </button>

                        {/* Type-specific guidance */}
                        {subtype === 'mod-request' && (
                            <GuidanceBlock title='MOD REQUEST GUIDE' items={[
                                'Is it necessary for ASOT gameplay?',
                                'Does it add unique value?',
                                'Does it fill a real gap in our loadout or mechanics?',
                                'Is the performance cost acceptable?',
                                'Is it unlikely to conflict with existing mods?',
                            ]} />
                        )}
                        {subtype === 'feature-request' && (
                            <GuidanceBlock title='FEATURE REQUEST GUIDE' items={[
                                'Is this for the website, Discord, or Arma?',
                                'Describe what problem it solves.',
                                'Include any relevant links or references.',
                            ]} />
                        )}
                        {category === 'bug' && (
                            <GuidanceBlock title='BUG REPORT GUIDE' items={[
                                'Provide exact steps to reproduce.',
                                'State expected vs actual behaviour.',
                                'Include severity honestly.',
                                'Attach screenshots where helpful.',
                            ]} />
                        )}
                        {category === 'mission' && (
                            <GuidanceBlock title='MISSION GUIDE' items={[
                                'Use the ASOT mission template structure.',
                                'Describe forces, objectives, and story.',
                                'Consider player count and experience.',
                            ]} />
                        )}
                        {category === 'campaign' && (
                            <GuidanceBlock title='CAMPAIGN GUIDE' items={[
                                'Minimum 3 missions required.',
                                'Each phase should build on the last.',
                                'Describe the overall narrative arc.',
                            ]} />
                        )}
                        {category === 'unit-feedback' && (
                            <GuidanceBlock title='FEEDBACK NOTES' items={[
                                'Visible to J4 only.',
                                'Multiple categories may be selected.',
                                'Anonymous submissions are allowed.',
                            ]} />
                        )}
                        {category === 'complaint' && (
                            <GuidanceBlock title='COMPLAINT NOTES' items={[
                                'Fully confidential — J4 only.',
                                'One complaint per subject.',
                                'Evidence is helpful but not required.',
                                'Frivolous complaints may result in action.',
                            ]} />
                        )}
                        {category === 'award' && (
                            <GuidanceBlock title='AWARD NOTES' items={[
                                'Nominee must meet ~50–75% of eligibility.',
                                'J4 may assign an alternate award if not eligible.',
                                'For nominations: justify clearly.',
                            ]} />
                        )}
                    </aside>

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                        {/* Similarity warnings */}
                        {similar.length > 0 && title.length > 10 && (
                            <SimilarityWarning items={similar} level={similar[0] ? 'strong' : 'soft'} />
                        )}

                        {/* Mod duplicate banner */}
                        {modDuplicate && (
                            <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.35)', borderLeft: '3px solid rgba(219,0,29,0.7)', padding: '10px 14px', marginBottom: 12 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.9)', marginBottom: 4 }}>
                                    ⚠ THIS MOD HAS ALREADY BEEN SUGGESTED
                                </div>
                                <Link href={`/community/tickets/${modDuplicate}`} target='_blank' style={{ fontSize: '0.7rem', color: 'rgba(0,195,255,0.8)', textDecoration: 'underline' }}>
                                    View existing ticket →
                                </Link>
                            </div>
                        )}

                        {/* MOD REQUEST fields */}
                        {subtype === 'mod-request' && (
                            <>
                                <FieldBlock label='TITLE' hint='Mod name or brief description' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. ACE3 Medical Expansion' maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='MOD LINK' hint='Workshop or GitHub URL' required>
                                    <input value={modLink} onChange={e => setModLink(e.target.value)} placeholder='https://steamcommunity.com/sharedfiles/...' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='GAME' hint='Which game is this mod for?'>
                                    <select value={game} onChange={e => setGame(e.target.value)} style={inputStyle}>
                                        <option value=''>Select game…</option>
                                        {ASOT_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                    {game === 'Other' && <input value={gameOther} onChange={e => setGameOther(e.target.value)} placeholder='Specify game…' style={{ ...inputStyle, marginTop: 4 }} />}
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What does this mod do?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' hint='Why should ASOT use this?'>
                                    <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={4} style={taStyle} />
                                </FieldBlock>
                            </>
                        )}

                        {/* FEATURE REQUEST fields */}
                        {subtype === 'feature-request' && (
                            <>
                                <FieldBlock label='TITLE' hint='Brief feature summary' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. Add dark mode to the calendar' maxLength={120} style={inputStyle} />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>
                                <FieldBlock label='CATEGORY' hint='Which platform is this for?'>
                                    <select value={featureCategory} onChange={e => setFeatureCategory(e.target.value)} style={inputStyle}>
                                        <option value=''>Select…</option>
                                        {FEATURE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </FieldBlock>
                                <FieldBlock label='REFERENCE LINK' hint='Optional URL'>
                                    <input value={weblink} onChange={e => setWeblink(e.target.value)} placeholder='https://…' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What should it do?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' hint='Why would this help?'>
                                    <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                            </>
                        )}

                        {/* BUG fields */}
                        {category === 'bug' && (
                            <>
                                <FieldBlock label='TITLE' hint='Short summary of the bug' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. Avatar not loading on profile page' maxLength={120} style={inputStyle} />
                                    <CharCount n={title.length} max={120} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='What went wrong?' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='STEPS TO REPRODUCE'>
                                    <textarea value={stepsToReproduce} onChange={e => setStepsToReproduce(e.target.value)} rows={4} placeholder='1. Go to…&#10;2. Click…&#10;3. Observe…' style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='EXPECTED RESULT'>
                                    <input value={expectedResult} onChange={e => setExpectedResult(e.target.value)} placeholder='What should happen?' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='ACTUAL RESULT'>
                                    <input value={actualResult} onChange={e => setActualResult(e.target.value)} placeholder='What actually happens?' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='SEVERITY'>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['low', 'medium', 'high', 'critical'] as const).map(s => (
                                            <button key={s} type='button' onClick={() => setSeverity(s)} style={{
                                                padding: '6px 12px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em',
                                                background: severity === s ? `${SEV_COLOURS[s]}18` : 'transparent',
                                                border: `1px solid ${severity === s ? SEV_COLOURS[s] : 'rgba(255,255,255,0.1)'}`,
                                                color: severity === s ? SEV_COLOURS[s] : 'rgba(237,237,237,0.35)',
                                                cursor: 'pointer', textTransform: 'uppercase',
                                            }}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </FieldBlock>
                                {/* Platform-specific field */}
                                {(subtype === 'bug-arma' || subtype === 'bug-other-game') && (
                                    <FieldBlock label='MOD LINK' hint='If related to a mod (optional)'>
                                        <input value={modLink} onChange={e => setModLink(e.target.value)} placeholder='Workshop URL (optional)' style={inputStyle} />
                                    </FieldBlock>
                                )}
                                {subtype === 'bug-discord' && (
                                    <FieldBlock label='DISCORD DETAIL' hint='Channel name, role, or issue type'>
                                        <input value={bugPlatformDetail} onChange={e => setBugPlatformDetail(e.target.value)} placeholder='e.g. #general, Admin role, permissions issue' style={inputStyle} />
                                    </FieldBlock>
                                )}
                                {(subtype === 'bug-website' || subtype === 'bug-milpack') && (
                                    <FieldBlock label='URL' hint='Page where the bug occurs'>
                                        <input value={weblink} onChange={e => setWeblink(e.target.value)} placeholder='https://…' style={inputStyle} />
                                    </FieldBlock>
                                )}
                                {subtype === 'bug-teamspeak' && (
                                    <FieldBlock label='ISSUE TYPE' hint='Roles / Permissions / Groups'>
                                        <input value={bugPlatformDetail} onChange={e => setBugPlatformDetail(e.target.value)} placeholder='e.g. Roles, Permissions, Groups' style={inputStyle} />
                                    </FieldBlock>
                                )}
                            </>
                        )}

                        {/* MISSION fields */}
                        {category === 'mission' && (
                            <>
                                <FieldBlock label='TITLE' hint='Mission name' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' hint='High-level overview' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='FORCES' hint='Friendly and enemy force compositions'>
                                    <textarea value={missionForces} onChange={e => setMissionForces(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='OBJECTIVES' hint='Primary and secondary objectives'>
                                    <textarea value={missionObjectives} onChange={e => setMissionObjectives(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='STORY' hint='Background and narrative'>
                                    <textarea value={missionStory} onChange={e => setMissionStory(e.target.value)} rows={4} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='PLAYER EXPERIENCE' hint='Intended player experience and mood'>
                                    <textarea value={missionPlayerExp} onChange={e => setMissionPlayerExp(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='MECHANICS' hint='Special mechanics or systems'>
                                    <textarea value={missionMechanics} onChange={e => setMissionMechanics(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                            </>
                        )}

                        {/* CAMPAIGN fields */}
                        {category === 'campaign' && (
                            <>
                                <FieldBlock label='TITLE' hint='Campaign name' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='OVERVIEW' hint='Campaign narrative and goals' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='MISSION PHASES' hint='Minimum 3 phases required' required>
                                    {phases.map((p, i) => (
                                        <div key={i} style={{ border: '1px solid rgba(255,255,255,0.06)', padding: '12px', marginBottom: 8, background: 'rgba(255,255,255,0.01)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(167,139,250,0.7)', fontFamily: 'monospace' }}>
                                                    PHASE {String(i + 1).padStart(2, '0')}
                                                </span>
                                                {phases.length > 3 && (
                                                    <button type='button' onClick={() => setPhases(p2 => p2.filter((_, j) => j !== i))} style={{
                                                        marginLeft: 'auto', background: 'none', border: 'none',
                                                        color: 'rgba(219,0,29,0.5)', cursor: 'pointer', display: 'flex', padding: 0,
                                                    }}>
                                                        <Delete style={{ fontSize: 14 }} />
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                value={p.title}
                                                onChange={e => setPhases(ps => ps.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                                                placeholder={`Phase ${i + 1} title`}
                                                style={{ ...inputStyle, marginBottom: 6 }}
                                            />
                                            <textarea
                                                value={p.description}
                                                onChange={e => setPhases(ps => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                                                placeholder='Phase description…'
                                                rows={2}
                                                style={taStyle}
                                            />
                                        </div>
                                    ))}
                                    <button type='button' onClick={() => setPhases(p => [...p, { title: '', description: '' }])} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'transparent', border: '1px dashed rgba(255,255,255,0.12)',
                                        padding: '7px 12px', cursor: 'pointer',
                                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.35)',
                                    }}>
                                        <Add style={{ fontSize: 14 }} /> ADD PHASE
                                    </button>
                                </FieldBlock>
                            </>
                        )}

                        {/* UNIT FEEDBACK fields */}
                        {category === 'unit-feedback' && (
                            <>
                                <FieldBlock label='TITLE' hint='Brief summary' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='CATEGORIES' hint='Select all that apply'>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {UNIT_FEEDBACK_CATS.map(c => (
                                            <button key={c} type='button' onClick={() => setFeedbackCategories(prev =>
                                                prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                            )} style={{
                                                padding: '5px 10px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                                                background: feedbackCategories.includes(c) ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${feedbackCategories.includes(c) ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                color: feedbackCategories.includes(c) ? 'rgba(74,222,128,0.9)' : 'rgba(237,237,237,0.4)',
                                                cursor: 'pointer',
                                            }}>
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </FieldBlock>
                                <FieldBlock label='FEEDBACK TYPE'>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['positive', 'neutral', 'negative'] as const).map(t => (
                                            <button key={t} type='button' onClick={() => setFeedbackType(t)} style={{
                                                padding: '6px 16px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em',
                                                background: feedbackType === t ? `${FB_TYPE_COLOURS[t]}18` : 'transparent',
                                                border: `1px solid ${feedbackType === t ? FB_TYPE_COLOURS[t] : 'rgba(255,255,255,0.1)'}`,
                                                color: feedbackType === t ? FB_TYPE_COLOURS[t] : 'rgba(237,237,237,0.35)',
                                                cursor: 'pointer', textTransform: 'uppercase',
                                            }}>
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='ANONYMOUS SUBMISSION'>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                        <div onClick={() => setIsAnonymous(v => !v)} style={{
                                            width: 32, height: 18, borderRadius: 9, position: 'relative',
                                            background: isAnonymous ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.1)',
                                            border: `1px solid ${isAnonymous ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`,
                                            cursor: 'pointer', transition: 'background 0.15s',
                                        }}>
                                            <div style={{
                                                position: 'absolute', top: 2, left: isAnonymous ? 14 : 2,
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#fff', transition: 'left 0.15s',
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>Submit anonymously</span>
                                    </label>
                                </FieldBlock>
                            </>
                        )}

                        {/* COMPLAINT fields */}
                        {category === 'complaint' && (
                            <>
                                <FieldBlock label='TITLE' hint='Brief subject' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='COMPLAINANT NAME' hint='Your name, or "Anonymous"'>
                                    <input value={complainantName} onChange={e => setComplainantName(e.target.value)} placeholder='Your name (or leave blank)' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='MEMBER(S) INVOLVED' hint='Comma-separated names' required>
                                    <input value={membersInvolved} onChange={e => setMembersInvolved(e.target.value)} placeholder='Name1, Name2…' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='STAFF VS MEMBER'>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                        <div onClick={() => setIsStaffComplaint(v => !v)} style={{
                                            width: 32, height: 18, borderRadius: 9, position: 'relative',
                                            background: isStaffComplaint ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.1)',
                                            border: `1px solid ${isStaffComplaint ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.15)'}`,
                                            cursor: 'pointer', transition: 'background 0.15s',
                                        }}>
                                            <div style={{
                                                position: 'absolute', top: 2, left: isStaffComplaint ? 14 : 2,
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#fff', transition: 'left 0.15s',
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>This involves a staff member</span>
                                    </label>
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='DESIRED OUTCOME'>
                                    <textarea value={desiredOutcome} onChange={e => setDesiredOutcome(e.target.value)} rows={3} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='ACKNOWLEDGEMENT' required>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                        <div onClick={() => setEvidenceAcknowledged(v => !v)} style={{
                                            width: 16, height: 16, marginTop: 2, flexShrink: 0,
                                            background: evidenceAcknowledged ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${evidenceAcknowledged ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.15)'}`,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {evidenceAcknowledged && <span style={{ color: 'rgba(74,222,128,0.9)', fontSize: 11, fontWeight: 800 }}>✓</span>}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                                            I acknowledge that this complaint will be treated as confidential and reviewed by J4 only. I understand that submitting a false or frivolous complaint may result in disciplinary action.
                                        </span>
                                    </label>
                                </FieldBlock>
                            </>
                        )}

                        {/* AWARD fields */}
                        {category === 'award' && subtype === 'award-nomination' && (
                            <>
                                <FieldBlock label='TITLE' hint='Award name or nomination summary' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='NOMINEE NAME' required>
                                    <input value={nomineeName} onChange={e => setNomineeName(e.target.value)} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='NOMINEE RANK'>
                                    <input value={nomineeRank} onChange={e => setNomineeRank(e.target.value)} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='NOMINATOR NAME'>
                                    <input value={nominatorName} onChange={e => setNominatorName(e.target.value)} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='AWARD TYPE'>
                                    <input value={awardType} onChange={e => setAwardType(e.target.value)} placeholder='e.g. Distinguished Service Medal' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='JUSTIFICATION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} style={taStyle} />
                                </FieldBlock>
                            </>
                        )}
                        {category === 'award' && subtype === 'award-creation' && (
                            <>
                                <FieldBlock label='TITLE' hint='Proposed award name' required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='CATEGORY'>
                                    <input value={awardCategory} onChange={e => setAwardCategory(e.target.value)} placeholder='e.g. Service, Valor, Meritorious' style={inputStyle} />
                                </FieldBlock>
                                <FieldBlock label='DESCRIPTION' required>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='REQUIREMENTS'>
                                    <textarea value={awardRequirements} onChange={e => setAwardRequirements(e.target.value)} rows={4} style={taStyle} />
                                </FieldBlock>
                                <FieldBlock label='DESIGN REFERENCE' hint='Image link or description'>
                                    <input value={awardDesignRef} onChange={e => setAwardDesignRef(e.target.value)} style={inputStyle} />
                                </FieldBlock>
                            </>
                        )}

                        {/* Other Comments (all types) */}
                        <FieldBlock label='OTHER COMMENTS' hint='Optional'>
                            <textarea value={otherComments} onChange={e => setOtherComments(e.target.value)} rows={3} style={taStyle} />
                        </FieldBlock>

                        {/* Error */}
                        {error && (
                            <div style={{
                                fontSize: '0.78rem', color: 'rgba(219,0,29,0.85)',
                                background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)',
                                borderLeft: '3px solid rgba(219,0,29,0.7)',
                                padding: '8px 12px', marginBottom: 1,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <Warning style={{ fontSize: 14 }} /> {error}
                            </div>
                        )}

                        {/* Similarity warning (repeating at bottom if many) */}
                        {similar.length >= 3 && title.length > 10 && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,160,0,0.7)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Warning style={{ fontSize: 13 }} />
                                We strongly recommend checking existing tickets before submitting.
                            </div>
                        )}

                        {/* Submit bar */}
                        <div style={{
                            padding: '16px', background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid rgba(219,0,29,0.4)',
                            display: 'flex', alignItems: 'center', gap: 16,
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>
                                    {`${catDef?.label.toUpperCase()} // ${SUBTYPES[category].find(s => s.value === subtype)?.label.toUpperCase()}`}
                                </div>
                                {title && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                                        {title}
                                    </div>
                                )}
                            </div>
                            <button type='submit' disabled={submitting} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: submitting ? 'rgba(219,0,29,0.06)' : 'rgba(219,0,29,0.14)',
                                border: '1px solid rgba(219,0,29,0.5)',
                                color: 'rgba(219,0,29,0.95)',
                                padding: '10px 28px', fontWeight: 800, fontSize: '0.78rem',
                                letterSpacing: '0.14em', cursor: submitting ? 'not-allowed' : 'pointer',
                                opacity: submitting ? 0.6 : 1, flexShrink: 0,
                            }}>
                                {submitting ? <><CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.7)' }} /> SUBMITTING…</> : 'SUBMIT TICKET'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}


function GuidanceBlock({ title, items }: { title: string; items: string[] }) {
    return (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 10 }}>
                {title}
            </div>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: '0.58rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(219,0,29,0.45)', marginTop: 1, flexShrink: 0 }}>
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.28)', lineHeight: 1.5 }}>{item}</span>
                </div>
            ))}
        </div>
    )
}

function CharCount({ n, max }: { n: number; max: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>{n}/{max}</span>
        </div>
    )
}

const SEV_COLOURS: Record<string, string> = {
    low: 'rgba(74,222,128,0.85)',
    medium: 'rgba(255,160,0,0.85)',
    high: 'rgba(219,0,29,0.85)',
    critical: 'rgba(255,0,0,1)',
}

const FB_TYPE_COLOURS: Record<string, string> = {
    positive: 'rgba(74,222,128,0.85)',
    neutral: 'rgba(237,237,237,0.55)',
    negative: 'rgba(219,0,29,0.85)',
}
