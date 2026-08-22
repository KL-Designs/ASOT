'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Add, Delete, Edit, Save, Close, Person, Group, CalendarToday } from '@mui/icons-material'
import SessionInstructionTab from './tabs/SessionInstructionTab'
import CandidateFeedbackTab from './tabs/CandidateFeedbackTab'
import ActivityTab from './tabs/ActivityTab'
import PeerReviewTab from './tabs/PeerReviewTab'

const RED = '#db001d'

type View = 'overview' | `session-${number}` | `feedback-${string}` | 'peer-review' | 'activity' | 'proposals'

type TSession = {
    _id: string
    sessionNumber: number
    weekNumber: number
    title: string
    catchUp: boolean
    catchUpRequired?: boolean
    sessionStatus?: string
    scheduledDate: string
    completedAt?: string
}

type TCandidate = {
    _id: string
    candidateNumber: number
    userId?: string
    displayName: string
    discordUsername?: string
    status: 'active' | 'withdrawn' | 'removed' | 'passed'
    notes?: string
    addedByName: string
    joinedAt: string
}

type TStaff = {
    _id: string
    userId: string
    displayName: string
    role: 'lead_instructor' | 'instructor' | 'observer'
    addedByName: string
    addedAt: string
}

type TSearchResult = {
    userId: string
    displayName: string
    discordUsername?: string
    type: 'member'
}

const CANDIDATE_STATUS_COLORS: Record<string, { color: string; border: string }> = {
    active:    { color: 'rgba(80,200,120,0.85)',  border: 'rgba(80,200,120,0.3)'  },
    passed:    { color: 'rgba(100,160,240,0.85)', border: 'rgba(100,160,240,0.3)' },
    removed:   { color: 'rgba(219,0,29,0.75)',    border: 'rgba(219,0,29,0.3)'    },
    withdrawn: { color: 'rgba(237,237,237,0.35)', border: 'rgba(255,255,255,0.1)' },
}

const ROLE_LABELS: Record<string, string> = {
    lead_instructor: 'Lead Instructor',
    instructor:      'Instructor',
    observer:        'Observer',
}

const STATUS_COLORS: Record<string, { color: string; border: string }> = {
    planning:    { color: 'rgba(255,180,50,0.85)',  border: 'rgba(255,180,50,0.35)'  },
    in_progress: { color: 'rgba(80,200,120,0.85)',  border: 'rgba(80,200,120,0.35)'  },
    active:      { color: 'rgba(80,200,120,0.85)',  border: 'rgba(80,200,120,0.35)'  },
    completed:   { color: 'rgba(100,160,240,0.85)', border: 'rgba(100,160,240,0.35)' },
    cancelled:   { color: 'rgba(237,237,237,0.35)', border: 'rgba(255,255,255,0.1)'  },
    archived:    { color: 'rgba(237,237,237,0.25)', border: 'rgba(255,255,255,0.08)' },
}

const STATUS_LABELS: Record<string, string> = {
    planning:    'Planning',
    in_progress: 'In Progress',
    active:      'Active',
    completed:   'Completed',
    cancelled:   'Cancelled',
    archived:    'Archived',
}

function fmt(dateStr: string | undefined) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

type TProposal = {
    _id: string
    entityType: string
    entityId: string
    fieldPath: string
    previousValue: string
    proposedValue: string
    proposedByName: string
    proposedAt: string
    status: 'pending' | 'approved' | 'rejected'
    reviewedByName?: string
    reviewedAt?: string
    reviewComment?: string
    approvedValue?: string
    isDirectCorrection: boolean
}

interface Props {
    instanceId: string
    instanceRef: string
    courseType: CourseInstanceType
    trainingTypeName: string
    status: string
    myId: string
    myName: string
    session1Date?: string
    startDate?: string
    endDate?: string
    leadInstructorName?: string
    candidateCount?: number
    canManage?: boolean
    isLocked?: boolean
    pendingProposalsCount?: number
}

export default function CourseWorkspaceClient({
    instanceId, instanceRef, courseType, trainingTypeName, status: initialStatus,
    myId, myName, startDate, endDate, canManage = false,
    isLocked: initialIsLocked = false, pendingProposalsCount: initialPendingCount = 0,
}: Props) {
    const [view, setView] = useState<View>('overview')
    const [status, setStatus] = useState(initialStatus)
    const [isLocked, setIsLocked] = useState(initialIsLocked)

    // Sidebar expand/collapse groups
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        sessions: true,
        feedback: false,
    })

    // Sessions
    const [sessions, setSessions] = useState<TSession[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(true)
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editSessionDate, setEditSessionDate] = useState('')
    const [savingSessionId, setSavingSessionId] = useState<string | null>(null)

    // Candidates
    const [candidates, setCandidates] = useState<TCandidate[]>([])
    const [candidatesLoading, setCandidatesLoading] = useState(true)
    const [showCandidateSearch, setShowCandidateSearch] = useState(false)
    const [candidateQuery, setCandidateQuery] = useState('')
    const [candidateResults, setCandidateResults] = useState<TSearchResult[]>([])
    const [searchingCandidates, setSearchingCandidates] = useState(false)
    const [addingCandidate, setAddingCandidate] = useState(false)
    const [removingCandidateId, setRemovingCandidateId] = useState<string | null>(null)
    const [updatingCandidateId, setUpdatingCandidateId] = useState<string | null>(null)

    // Staff
    const [staff, setStaff] = useState<TStaff[]>([])
    const [staffLoading, setStaffLoading] = useState(true)
    const [showStaffSearch, setShowStaffSearch] = useState(false)
    const [staffQuery, setStaffQuery] = useState('')
    const [staffResults, setStaffResults] = useState<TSearchResult[]>([])
    const [searchingStaff, setSearchingStaff] = useState(false)
    const [addingStaff, setAddingStaff] = useState(false)
    const [removingStaffId, setRemovingStaffId] = useState<string | null>(null)
    const [newStaffRole, setNewStaffRole] = useState<'lead_instructor' | 'instructor' | 'observer'>('instructor')

    // Status change
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const [showStatusMenu, setShowStatusMenu] = useState(false)

    // Reopen modal
    const [showReopenModal, setShowReopenModal] = useState(false)
    const [reopenReason, setReopenReason] = useState('')
    const [reopening, setReopening] = useState(false)

    // Proposals
    const [proposals, setProposals] = useState<TProposal[]>([])
    const [proposalsLoading, setProposalsLoading] = useState(false)
    const [pendingCount, setPendingCount] = useState(initialPendingCount)
    const [showProposeModal, setShowProposeModal] = useState(false)
    const [proposeForm, setProposeForm] = useState({ entityType: 'course_instance', entityId: instanceId, fieldPath: '', previousValue: '', proposedValue: '' })
    const [submittingProposal, setSubmittingProposal] = useState(false)
    const [reviewingProposalId, setReviewingProposalId] = useState<string | null>(null)
    const [reviewComment, setReviewComment] = useState('')

    const searchCandidateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchStaffDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const statusMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!showStatusMenu) return
        function onOutside(e: MouseEvent) {
            if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
                setShowStatusMenu(false)
            }
        }
        document.addEventListener('mousedown', onOutside)
        return () => document.removeEventListener('mousedown', onOutside)
    }, [showStatusMenu])

    // Load sessions, candidates, staff on mount
    useEffect(() => {
        fetch(`/api/j3/course-instances/${instanceId}/sessions`)
            .then(r => r.json())
            .then(d => setSessions(d.sessions ?? []))
            .catch(() => {})
            .finally(() => setSessionsLoading(false))

        fetch(`/api/j3/course-instances/${instanceId}/candidates`)
            .then(r => r.json())
            .then(d => setCandidates(d.candidates ?? []))
            .catch(() => {})
            .finally(() => setCandidatesLoading(false))

        fetch(`/api/j3/course-instances/${instanceId}/staff`)
            .then(r => r.json())
            .then(d => setStaff(d.staff ?? []))
            .catch(() => {})
            .finally(() => setStaffLoading(false))
    }, [instanceId])

    // Candidate search debounce
    useEffect(() => {
        if (searchCandidateDebounce.current) clearTimeout(searchCandidateDebounce.current)
        if (!candidateQuery.trim() || candidateQuery.trim().length < 2) { setCandidateResults([]); return }
        searchCandidateDebounce.current = setTimeout(async () => {
            setSearchingCandidates(true)
            try {
                const r = await fetch(`/api/j3/candidate-search?q=${encodeURIComponent(candidateQuery.trim())}&courseInstanceId=${instanceId}`)
                const d = await r.json()
                setCandidateResults(d.results ?? [])
            } catch { /* ignore */ } finally {
                setSearchingCandidates(false)
            }
        }, 300)
        return () => { if (searchCandidateDebounce.current) clearTimeout(searchCandidateDebounce.current) }
    }, [candidateQuery, instanceId])

    // Staff search debounce
    useEffect(() => {
        if (searchStaffDebounce.current) clearTimeout(searchStaffDebounce.current)
        if (!staffQuery.trim() || staffQuery.trim().length < 2) { setStaffResults([]); return }
        searchStaffDebounce.current = setTimeout(async () => {
            setSearchingStaff(true)
            try {
                const r = await fetch(`/api/j3/candidate-search?q=${encodeURIComponent(staffQuery.trim())}`)
                const d = await r.json()
                setStaffResults(d.results ?? [])
            } catch { /* ignore */ } finally {
                setSearchingStaff(false)
            }
        }, 300)
        return () => { if (searchStaffDebounce.current) clearTimeout(searchStaffDebounce.current) }
    }, [staffQuery])

    async function handleSaveSessionDate(session: TSession) {
        if (!editSessionDate || savingSessionId) return
        setSavingSessionId(session._id)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/sessions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: session._id, scheduledDate: editSessionDate }),
            })
            if (!res.ok) return
            const d = await res.json()
            setSessions(prev => prev.map(s => s._id === session._id ? d.session : s))
            setEditingSessionId(null)
            setEditSessionDate('')
        } finally {
            setSavingSessionId(null)
        }
    }

    async function handleAddCandidate(result: TSearchResult) {
        if (addingCandidate) return
        setAddingCandidate(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: result.userId, displayName: result.displayName, discordUsername: result.discordUsername }),
            })
            if (!res.ok) return
            const d = await res.json()
            setCandidates(prev => [...prev, d])
            setCandidateQuery('')
            setCandidateResults([])
            setShowCandidateSearch(false)
        } finally {
            setAddingCandidate(false)
        }
    }

    const handleCandidateStatus = useCallback(async (candidateId: string, newStatus: string) => {
        if (updatingCandidateId) return
        setUpdatingCandidateId(candidateId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/candidates`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId, status: newStatus }),
            })
            if (!res.ok) return
            const d = await res.json()
            setCandidates(prev => prev.map(c => c._id === candidateId ? { ...c, status: d.candidate.status } : c))
        } finally {
            setUpdatingCandidateId(null)
        }
    }, [instanceId, updatingCandidateId])

    async function handleRemoveCandidate(candidateId: string) {
        if (removingCandidateId) return
        setRemovingCandidateId(candidateId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/candidates`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId }),
            })
            if (!res.ok) return
            setCandidates(prev => prev.filter(c => c._id !== candidateId))
        } finally {
            setRemovingCandidateId(null)
        }
    }

    async function handleAddStaff(result: TSearchResult) {
        if (addingStaff) return
        setAddingStaff(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/staff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: result.userId, displayName: result.displayName, role: newStaffRole }),
            })
            if (!res.ok) return
            const d = await res.json()
            setStaff(prev => [...prev, d])
            setStaffQuery('')
            setStaffResults([])
            setShowStaffSearch(false)
        } finally {
            setAddingStaff(false)
        }
    }

    async function handleRemoveStaff(staffId: string) {
        if (removingStaffId) return
        setRemovingStaffId(staffId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/staff`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId }),
            })
            if (!res.ok) return
            setStaff(prev => prev.filter(s => s._id !== staffId))
        } finally {
            setRemovingStaffId(null)
        }
    }

    async function handleUpdateStatus(newStatus: string) {
        if (updatingStatus) return
        const prevStatus = status
        setStatus(newStatus)
        setShowStatusMenu(false)
        setUpdatingStatus(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) {
                setStatus(prevStatus)
            } else if (newStatus === 'completed' || newStatus === 'cancelled') {
                setIsLocked(true)
            }
        } catch {
            setStatus(prevStatus)
        } finally {
            setUpdatingStatus(false)
        }
    }

    async function handleReopen() {
        if (reopening || !reopenReason.trim()) return
        setReopening(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reopen', reason: reopenReason.trim() }),
            })
            if (res.ok) {
                setStatus('in_progress')
                setIsLocked(false)
                setShowReopenModal(false)
                setReopenReason('')
            }
        } finally {
            setReopening(false)
        }
    }

    async function loadProposals() {
        setProposalsLoading(true)
        try {
            const r = await fetch(`/api/j3/course-instances/${instanceId}/change-proposals`)
            const d = await r.json()
            const list: TProposal[] = (d.proposals ?? []).map((p: TProposal & { _id: { $oid?: string } | string }) => ({
                ...p,
                _id: typeof p._id === 'object' && p._id && '$oid' in p._id ? (p._id as { $oid: string }).$oid : String(p._id),
            }))
            setProposals(list)
            setPendingCount(list.filter(p => p.status === 'pending').length)
        } catch { /* ignore */ } finally {
            setProposalsLoading(false)
        }
    }

    async function handleSubmitProposal() {
        if (submittingProposal || !proposeForm.fieldPath.trim() || !proposeForm.proposedValue.trim()) return
        setSubmittingProposal(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/change-proposals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proposeForm),
            })
            if (res.ok) {
                setShowProposeModal(false)
                setProposeForm({ entityType: 'course_instance', entityId: instanceId, fieldPath: '', previousValue: '', proposedValue: '' })
                if (view === 'proposals') loadProposals()
                else setPendingCount(c => c + 1)
            }
        } finally {
            setSubmittingProposal(false)
        }
    }

    async function handleReviewProposal(proposalId: string, action: 'approve' | 'reject') {
        if (reviewingProposalId) return
        setReviewingProposalId(proposalId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/change-proposals/${proposalId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, comment: reviewComment }),
            })
            if (res.ok) {
                const d = await res.json()
                setProposals(prev => prev.map(p => p._id === proposalId ? { ...p, ...d.proposal, _id: proposalId } : p))
                setPendingCount(prev => Math.max(0, prev - 1))
                setReviewComment('')
            }
        } finally {
            setReviewingProposalId(null)
        }
    }

    useEffect(() => {
        if (view === 'proposals') loadProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const statusCfg = STATUS_COLORS[status] ?? STATUS_COLORS.planning
    const courseLabel = courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'
    const progressableStatuses = ['planning', 'in_progress', 'completed', 'cancelled']

    // Determine current view title for header
    function getViewTitle(): string {
        if (view === 'overview') return 'Session & Candidate Details'
        if (view === 'peer-review') return 'Peer Review Forms'
        if (view === 'activity') return 'Activity History'
        if (view === 'proposals') return 'Change Proposals'
        if (view.startsWith('session-')) {
            const num = parseInt(view.replace('session-', ''), 10)
            const s = sessions.find(s => s.sessionNumber === num)
            return s ? `${s.title} — Instructions` : `Session ${num} Instructions`
        }
        if (view.startsWith('feedback-')) {
            const cid = view.replace('feedback-', '')
            const c = candidates.find(c => c._id === cid)
            return c ? `Candidate #${c.candidateNumber} — ${c.displayName}` : 'Candidate Feedback'
        }
        return view
    }

    function renderOverview() {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

                {/* Summary strip */}
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    {startDate && (
                        <div>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>Start Date</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <CalendarToday style={{ fontSize: 13 }} />
                                {fmt(startDate)}
                            </div>
                        </div>
                    )}
                    {endDate && (
                        <div>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>End Date</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <CalendarToday style={{ fontSize: 13 }} />
                                {fmt(endDate)}
                            </div>
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>Candidates</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Group style={{ fontSize: 13 }} />
                            {candidates.length}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>Staff</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Person style={{ fontSize: 13 }} />
                            {staff.length}
                        </div>
                    </div>
                </div>

                {/* Sessions */}
                <div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 12 }}>Sessions</div>
                    {sessionsLoading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                    ) : sessions.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                            No sessions scheduled. Sessions are created when a course is launched with a Session 1 date.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessions.map(s => (
                                <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${s.catchUp ? 'rgba(255,180,50,0.08)' : 'rgba(255,255,255,0.06)'}` }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'rgba(219,0,29,0.6)', letterSpacing: '0.1em', textAlign: 'center' }}>S{s.sessionNumber}</span>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.75)', marginBottom: 1 }}>{s.title}</div>
                                        {s.catchUp && (
                                            <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.7)', border: '1px solid rgba(255,180,50,0.2)', padding: '1px 4px' }}>Catch-up</span>
                                        )}
                                    </div>
                                    {editingSessionId === s._id ? (
                                        <input
                                            type='date'
                                            value={editSessionDate}
                                            min={new Date().toLocaleDateString('en-CA')}
                                            onChange={e => setEditSessionDate(e.target.value)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderBottom: `2px solid rgba(219,0,29,0.4)`, color: 'rgba(237,237,237,0.9)', fontSize: '0.72rem', padding: '4px 7px', outline: 'none' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', whiteSpace: 'nowrap' }}>{fmt(s.scheduledDate)}</span>
                                    )}
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {editingSessionId === s._id ? (
                                            <>
                                                <button type='button' onClick={() => handleSaveSessionDate(s)} disabled={!editSessionDate || savingSessionId === s._id}
                                                    style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.8)', cursor: savingSessionId === s._id ? 'default' : 'pointer', opacity: savingSessionId === s._id ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                                                    <Save style={{ fontSize: 12 }} />
                                                </button>
                                                <button type='button' onClick={() => { setEditingSessionId(null); setEditSessionDate('') }}
                                                    style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                    <Close style={{ fontSize: 12 }} />
                                                </button>
                                            </>
                                        ) : (
                                            <button type='button' onClick={() => { setEditingSessionId(s._id); setEditSessionDate(s.scheduledDate ? s.scheduledDate.slice(0, 10) : '') }}
                                                style={{ padding: '3px 7px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                <Edit style={{ fontSize: 11 }} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Candidates */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)' }}>Candidates ({candidates.length})</div>
                        <button type='button' onClick={() => setShowCandidateSearch(s => !s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.6)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Add style={{ fontSize: 11 }} /> Add Candidate
                        </button>
                    </div>

                    {showCandidateSearch && (
                        <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 14 }} onClick={() => { setShowCandidateSearch(false); setCandidateQuery(''); setCandidateResults([]) }} />
                        <div style={{ position: 'relative', zIndex: 15, marginBottom: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <input
                                type='text'
                                placeholder='Search by name or username…'
                                value={candidateQuery}
                                onChange={e => setCandidateQuery(e.target.value)}
                                autoFocus
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none' }}
                            />
                            {searchingCandidates && (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', marginTop: 8, padding: '4px 0' }}>Searching…</div>
                            )}
                            {candidateResults.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {candidateResults.map(r => (
                                        <button key={r.userId} type='button' onClick={() => handleAddCandidate(r)} disabled={addingCandidate}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.75)', cursor: addingCandidate ? 'default' : 'pointer', textAlign: 'left' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{r.displayName}</span>
                                            {r.discordUsername && <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>{r.discordUsername}</span>}
                                            <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)', border: '1px solid rgba(80,200,120,0.2)', padding: '1px 5px', flexShrink: 0 }}>Add</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {candidateQuery.trim().length >= 2 && !searchingCandidates && candidateResults.length === 0 && (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', marginTop: 8 }}>No results</div>
                            )}
                        </div>
                        </>
                    )}

                    {candidatesLoading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                    ) : candidates.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No candidates added yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {candidates.map(c => {
                                const sc = CANDIDATE_STATUS_COLORS[c.status] ?? CANDIDATE_STATUS_COLORS.active
                                return (
                                    <div key={c._id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto auto', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>#{c.candidateNumber}</span>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{c.displayName}</div>
                                            {c.discordUsername && <div style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.28)' }}>{c.discordUsername}</div>}
                                        </div>
                                        <select
                                            value={c.status}
                                            onChange={e => handleCandidateStatus(c._id, e.target.value)}
                                            disabled={updatingCandidateId === c._id}
                                            style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${sc.border}`, color: sc.color, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 5px', cursor: 'pointer', outline: 'none' }}
                                        >
                                            <option value='active'>Active</option>
                                            <option value='withdrawn'>Withdrawn</option>
                                            <option value='removed'>Removed</option>
                                            <option value='passed'>Passed</option>
                                        </select>
                                        <button type='button' onClick={() => handleRemoveCandidate(c._id)} disabled={removingCandidateId === c._id}
                                            style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.2)', cursor: removingCandidateId === c._id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', opacity: removingCandidateId === c._id ? 0.4 : 1 }}>
                                            <Delete style={{ fontSize: 11 }} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Staff */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)' }}>Staff ({staff.length})</div>
                        <button type='button' onClick={() => setShowStaffSearch(s => !s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.6)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Add style={{ fontSize: 11 }} /> Add Staff
                        </button>
                    </div>

                    {showStaffSearch && (
                        <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 14 }} onClick={() => { setShowStaffSearch(false); setStaffQuery(''); setStaffResults([]) }} />
                        <div style={{ position: 'relative', zIndex: 15, marginBottom: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type='text'
                                    placeholder='Search member by name…'
                                    value={staffQuery}
                                    onChange={e => setStaffQuery(e.target.value)}
                                    autoFocus
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none' }}
                                />
                                <select value={newStaffRole} onChange={e => setNewStaffRole(e.target.value as typeof newStaffRole)}
                                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', fontSize: '0.65rem', padding: '7px 8px', cursor: 'pointer', outline: 'none' }}>
                                    <option value='lead_instructor'>Lead Instructor</option>
                                    <option value='instructor'>Instructor</option>
                                    <option value='observer'>Observer</option>
                                </select>
                            </div>
                            {searchingStaff && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>Searching…</div>}
                            {staffResults.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {staffResults.map(r => (
                                        <button key={r.userId} type='button' onClick={() => handleAddStaff(r)} disabled={addingStaff}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.75)', cursor: addingStaff ? 'default' : 'pointer', textAlign: 'left' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{r.displayName}</span>
                                            {r.discordUsername && <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>{r.discordUsername}</span>}
                                            <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)', border: '1px solid rgba(80,200,120,0.2)', padding: '1px 5px', flexShrink: 0 }}>Add</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {staffQuery.trim().length >= 2 && !searchingStaff && staffResults.length === 0 && (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>No results</div>
                            )}
                        </div>
                        </>
                    )}

                    {staffLoading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                    ) : staff.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No staff assigned yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {staff.map(s => (
                                <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{s.displayName}</div>
                                    </div>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.role === 'lead_instructor' ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.4)', border: `1px solid ${s.role === 'lead_instructor' ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.1)'}`, padding: '2px 6px' }}>
                                        {ROLE_LABELS[s.role] ?? s.role}
                                    </span>
                                    <button type='button' onClick={() => handleRemoveStaff(s._id)} disabled={removingStaffId === s._id}
                                        style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.2)', cursor: removingStaffId === s._id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', opacity: removingStaffId === s._id ? 0.4 : 1 }}>
                                        <Delete style={{ fontSize: 11 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    function renderProposalsView() {
        const ENTITY_LABELS: Record<string, string> = {
            course_instance: 'Course', course_candidate: 'Candidate', candidate_feedback: 'Feedback',
            candidate_attendance: 'Attendance', course_session: 'Session', training_record: 'Record',
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {canManage && (
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>
                        As a J3 lead you can approve or reject proposals. Approved proposals are logged as authorised corrections.
                    </div>
                )}
                {proposalsLoading ? (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                ) : proposals.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No proposals submitted yet.</div>
                ) : (
                    proposals.map(p => {
                        const isPending = p.status === 'pending'
                        const statusColor = p.status === 'approved' ? 'rgba(80,200,120,0.8)' : p.status === 'rejected' ? 'rgba(219,0,29,0.7)' : 'rgba(255,180,50,0.8)'
                        const borderColor = p.status === 'approved' ? 'rgba(80,200,120,0.15)' : p.status === 'rejected' ? 'rgba(219,0,29,0.15)' : 'rgba(255,180,50,0.15)'
                        return (
                            <div key={p._id} style={{ border: `1px solid ${borderColor}`, background: 'rgba(255,255,255,0.02)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, border: `1px solid ${statusColor}30`, padding: '2px 6px' }}>{p.isDirectCorrection ? 'Direct Correction' : p.status}</span>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)' }}>{p.fieldPath}</span>
                                    <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)' }}>{ENTITY_LABELS[p.entityType] ?? p.entityType}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.52rem', color: 'rgba(237,237,237,0.25)' }}>{new Date(p.proposedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 3 }}>Previous</div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.55)', fontStyle: p.previousValue ? 'normal' : 'italic' }}>{p.previousValue || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 3 }}>Proposed</div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.85)' }}>{p.approvedValue ?? p.proposedValue}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.3)' }}>
                                    Submitted by <strong style={{ color: 'rgba(237,237,237,0.5)' }}>{p.proposedByName}</strong>
                                    {p.reviewedByName && <> · Reviewed by <strong style={{ color: 'rgba(237,237,237,0.5)' }}>{p.reviewedByName}</strong></>}
                                    {p.reviewComment && <> · "{p.reviewComment}"</>}
                                </div>
                                {isPending && canManage && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                        {reviewingProposalId === p._id ? (
                                            <>
                                                <input
                                                    type='text'
                                                    placeholder='Comment (optional)'
                                                    value={reviewComment}
                                                    onChange={e => setReviewComment(e.target.value)}
                                                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.68rem', padding: '5px 8px', outline: 'none' }}
                                                />
                                                <button type='button' onClick={() => handleReviewProposal(p._id, 'approve')}
                                                    style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(80,200,120,0.35)', color: 'rgba(80,200,120,0.8)', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    Approve
                                                </button>
                                                <button type='button' onClick={() => handleReviewProposal(p._id, 'reject')}
                                                    style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.7)', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    Reject
                                                </button>
                                                <button type='button' onClick={() => setReviewingProposalId(null)}
                                                    style={{ padding: '4px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.52rem', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <button type='button' onClick={() => setReviewingProposalId(p._id)}
                                                style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                Review
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        )
    }

    function renderMainContent() {
        if (view === 'overview') return renderOverview()

        if (view === 'proposals') return renderProposalsView()

        if (view.startsWith('session-')) {
            const num = parseInt(view.replace('session-', ''), 10)
            const session = sessions.find(s => s.sessionNumber === num)
            if (!session) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)' }}>Session not found.</div>
            return (
                <SessionInstructionTab
                    key={view}
                    courseInstanceId={instanceId}
                    sessionId={session._id}
                    session={session}
                    myId={myId}
                    myName={myName}
                    courseStaff={staff}
                />
            )
        }

        if (view.startsWith('feedback-')) {
            const candidateId = view.replace('feedback-', '')
            const candidate = candidates.find(c => c._id === candidateId)
            if (!candidate) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)' }}>Candidate not found.</div>
            return (
                <CandidateFeedbackTab
                    key={view}
                    courseInstanceId={instanceId}
                    candidateId={candidateId}
                    candidate={candidate}
                    sessions={sessions}
                    myId={myId}
                    myName={myName}
                />
            )
        }

        if (view === 'activity') {
            return <ActivityTab key='activity' courseInstanceId={instanceId} canManage={canManage} />
        }

        if (view === 'peer-review') {
            return <PeerReviewTab courseInstanceId={instanceId} candidates={candidates} />
        }

        return null
    }

    // Sidebar item style
    function navItemStyle(isActive: boolean, dimmed = false) {
        return {
            display: 'block' as const,
            width: '100%',
            textAlign: 'left' as const,
            padding: '7px 16px 7px 28px',
            background: isActive ? 'rgba(219,0,29,0.06)' : 'transparent',
            borderLeft: `3px solid ${isActive ? RED : 'transparent'}`,
            border: 'none' as const,
            borderLeftStyle: 'solid' as const,
            borderLeftWidth: 3,
            borderLeftColor: isActive ? RED : 'transparent',
            color: isActive ? 'rgba(237,237,237,0.9)' : dimmed ? 'rgba(237,237,237,0.18)' : 'rgba(237,237,237,0.5)',
            fontSize: '0.65rem' as const,
            fontWeight: isActive ? 700 : 500,
            letterSpacing: '0.03em' as const,
            cursor: 'pointer' as const,
            lineHeight: 1.4 as const,
        }
    }

    function groupHeaderStyle() {
        return {
            display: 'flex' as const,
            alignItems: 'center' as const,
            gap: 6,
            width: '100%',
            padding: '8px 16px',
            background: 'transparent',
            border: 'none' as const,
            color: 'rgba(237,237,237,0.3)' as const,
            fontSize: '0.55rem' as const,
            fontWeight: 800 as const,
            letterSpacing: '0.14em' as const,
            textTransform: 'uppercase' as const,
            cursor: 'pointer' as const,
            textAlign: 'left' as const,
        }
    }

    return (
        <div style={{ display: 'flex', minHeight: '100%', background: '#0a0a0a' }}>

            {/* Left sidebar */}
            <div style={{ width: 230, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
                {/* Back */}
                <div style={{ padding: '16px 16px 8px' }}>
                    <Link href='/dashboard/j3' style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', textDecoration: 'none' }}>
                        ← Back
                    </Link>
                </div>

                {/* Course identity */}
                <div style={{ padding: '10px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 4 }}>{courseLabel}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', marginBottom: 6 }}>{instanceRef}</div>
                    {/* Lock indicator */}
                    {isLocked && (
                        <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.7)', border: '1px solid rgba(255,180,50,0.2)', padding: '2px 6px' }}>
                            🔒 Locked
                        </div>
                    )}
                    {/* Status with inline change */}
                    <div ref={statusMenuRef} style={{ position: 'relative', marginTop: isLocked ? 6 : 0 }}>
                        <button type='button' onClick={() => !isLocked && setShowStatusMenu(s => !s)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${statusCfg.border}`, color: statusCfg.color, fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 7px', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1 }}>
                            {STATUS_LABELS[status] ?? status} {!isLocked && '▾'}
                        </button>
                        {showStatusMenu && !isLocked && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#111', border: '1px solid rgba(255,255,255,0.12)', marginTop: 4, minWidth: 140 }}>
                                {progressableStatuses.filter(s => s !== status).map(s => {
                                    const cfg = STATUS_COLORS[s]
                                    return (
                                        <button key={s} type='button' onClick={() => handleUpdateStatus(s)}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent', border: 'none', color: cfg?.color ?? 'rgba(237,237,237,0.6)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                            {STATUS_LABELS[s] ?? s}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                        {/* Reopen option for J3 leads / J4 on completed locked courses */}
                        {isLocked && canManage && status === 'completed' && (
                            <button type='button' onClick={() => setShowReopenModal(true)}
                                style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid rgba(255,180,50,0.25)', color: 'rgba(255,180,50,0.7)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', cursor: 'pointer' }}>
                                Reopen Course
                            </button>
                        )}
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ padding: '8px 0', flex: 1 }}>

                    {/* Overview */}
                    <button type='button' onClick={() => setView('overview')} style={navItemStyle(view === 'overview')}>
                        Session & Candidate Details
                    </button>

                    <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                    {/* Session Instructions group */}
                    <button type='button' onClick={() => setExpandedGroups(g => ({ ...g, sessions: !g.sessions }))} style={groupHeaderStyle()}>
                        <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>{expandedGroups.sessions ? '▼' : '▶'}</span>
                        Session Instructions
                    </button>
                    {expandedGroups.sessions && sessions.map(s => {
                        const isActive = view === `session-${s.sessionNumber}`
                        return (
                            <button key={s._id} type='button' onClick={() => setView(`session-${s.sessionNumber}` as View)} style={navItemStyle(isActive)}>
                                {s.title}
                                {s.catchUp && <span style={{ display: 'inline-block', marginLeft: 5, fontSize: '0.42rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.5)' }}>Catch-up</span>}
                            </button>
                        )
                    })}
                    {expandedGroups.sessions && sessions.length === 0 && (
                        <div style={{ padding: '4px 28px', fontSize: '0.58rem', color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>No sessions yet</div>
                    )}

                    <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                    {/* Candidate Feedback group */}
                    <button type='button' onClick={() => setExpandedGroups(g => ({ ...g, feedback: !g.feedback }))} style={groupHeaderStyle()}>
                        <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>{expandedGroups.feedback ? '▼' : '▶'}</span>
                        Candidate Feedback
                    </button>
                    {expandedGroups.feedback && candidates.map(c => {
                        const isActive = view === `feedback-${c._id}`
                        return (
                            <button key={c._id} type='button' onClick={() => setView(`feedback-${c._id}` as View)} style={navItemStyle(isActive)}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: isActive ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.25)', marginRight: 5 }}>#{c.candidateNumber}</span>
                                {c.displayName}
                            </button>
                        )
                    })}
                    {expandedGroups.feedback && candidates.length === 0 && (
                        <div style={{ padding: '4px 28px', fontSize: '0.58rem', color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>No candidates yet</div>
                    )}

                    <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                    {/* Peer Review */}
                    <button type='button' onClick={() => setView('peer-review')} style={navItemStyle(view === 'peer-review')}>
                        Peer Review Forms
                    </button>

                    {/* Activity */}
                    <button type='button' onClick={() => setView('activity')} style={navItemStyle(view === 'activity')}>
                        Activity History
                    </button>

                    {/* Proposals (visible when locked) */}
                    {isLocked && (
                        <button type='button' onClick={() => setView('proposals')} style={{ ...navItemStyle(view === 'proposals'), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Change Proposals</span>
                            {pendingCount > 0 && (
                                <span style={{ fontSize: '0.44rem', fontWeight: 800, background: 'rgba(255,180,50,0.15)', border: '1px solid rgba(255,180,50,0.3)', color: 'rgba(255,180,50,0.85)', padding: '1px 5px', borderRadius: 2 }}>{pendingCount}</span>
                            )}
                        </button>
                    )}

                </nav>

                {/* Training Record link */}
                <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Link
                        href={`/dashboard/j3/training-records/${instanceId}`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase', textDecoration: 'none',
                            color: 'rgba(219,0,29,0.55)',
                        }}
                    >
                        Training Record →
                    </Link>
                </div>
            </div>

            {/* Main content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6 }}>
                    {trainingTypeName} — {instanceRef}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                    <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        {getViewTitle()}
                    </h1>
                    {isLocked && view !== 'proposals' && (
                        <button type='button' onClick={() => setShowProposeModal(true)}
                            style={{ flexShrink: 0, marginLeft: 16, padding: '5px 12px', background: 'transparent', border: '1px solid rgba(255,180,50,0.3)', color: 'rgba(255,180,50,0.75)', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            + Propose Edit
                        </button>
                    )}
                </div>

                {/* Lock notice banner */}
                {isLocked && (
                    <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(255,180,50,0.05)', border: '1px solid rgba(255,180,50,0.15)', fontSize: '0.62rem', color: 'rgba(255,180,50,0.6)', lineHeight: 1.5 }}>
                        This course is locked. Direct editing is disabled. Use <strong>Propose Edit</strong> to submit changes for review by J3 leads.
                        {canManage && ' As a J3 lead you can approve proposals or use Reopen Course to unlock for editing.'}
                    </div>
                )}

                {renderMainContent()}
            </div>

            {/* Reopen Course modal */}
            {showReopenModal && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowReopenModal(false)} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 101, background: '#111', border: '1px solid rgba(255,255,255,0.12)', padding: '28px 32px', width: 420, maxWidth: '90vw' }}>
                        <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.65)', marginBottom: 10 }}>Reopen Course</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)', marginBottom: 16 }}>Unlock {instanceRef} for editing</div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 20, lineHeight: 1.5 }}>
                            Reopening will set the status back to In Progress and remove the lock. A reason is required and will be logged.
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>Reason *</div>
                            <textarea
                                value={reopenReason}
                                onChange={e => setReopenReason(e.target.value)}
                                placeholder='Explain why this course needs to be reopened…'
                                rows={3}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.75rem', padding: '8px 10px', outline: 'none', resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setShowReopenModal(false)}
                                style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', fontWeight: 700, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleReopen} disabled={!reopenReason.trim() || reopening}
                                style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(255,180,50,0.4)', color: 'rgba(255,180,50,0.85)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (!reopenReason.trim() || reopening) ? 'default' : 'pointer', opacity: (!reopenReason.trim() || reopening) ? 0.4 : 1 }}>
                                {reopening ? 'Reopening…' : 'Reopen Course'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Propose Edit modal */}
            {showProposeModal && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowProposeModal(false)} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 101, background: '#111', border: '1px solid rgba(255,255,255,0.12)', padding: '28px 32px', width: 480, maxWidth: '90vw' }}>
                        <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.65)', marginBottom: 10 }}>Propose Edit</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)', marginBottom: 20 }}>Submit a change for review</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Entity Type</div>
                                <select value={proposeForm.entityType} onChange={e => setProposeForm(f => ({ ...f, entityType: e.target.value, entityId: e.target.value === 'course_instance' ? instanceId : '' }))}
                                    style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.8)', fontSize: '0.72rem', padding: '7px 10px', outline: 'none', cursor: 'pointer' }}>
                                    <option value='course_instance'>Course — General</option>
                                    <option value='course_candidate'>Candidate</option>
                                    <option value='candidate_feedback'>Candidate Feedback</option>
                                    <option value='candidate_attendance'>Attendance</option>
                                    <option value='course_session'>Session</option>
                                    <option value='training_record'>Training Record</option>
                                </select>
                            </div>
                            {proposeForm.entityType !== 'course_instance' && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Entity ID / Reference</div>
                                    <input type='text' value={proposeForm.entityId} onChange={e => setProposeForm(f => ({ ...f, entityId: e.target.value }))}
                                        placeholder='Candidate name, session ref, etc.'
                                        style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.72rem', padding: '7px 10px', outline: 'none' }} />
                                </div>
                            )}
                            <div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Field / What to change *</div>
                                <input type='text' value={proposeForm.fieldPath} onChange={e => setProposeForm(f => ({ ...f, fieldPath: e.target.value }))}
                                    placeholder='e.g. notes, candidate status, session date…'
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.72rem', padding: '7px 10px', outline: 'none' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Current Value</div>
                                <input type='text' value={proposeForm.previousValue} onChange={e => setProposeForm(f => ({ ...f, previousValue: e.target.value }))}
                                    placeholder='What it currently says (optional)'
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.9)', fontSize: '0.72rem', padding: '7px 10px', outline: 'none' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Proposed Value *</div>
                                <textarea value={proposeForm.proposedValue} onChange={e => setProposeForm(f => ({ ...f, proposedValue: e.target.value }))}
                                    placeholder='What it should be changed to…'
                                    rows={3}
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.72rem', padding: '7px 10px', outline: 'none', resize: 'vertical' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button type='button' onClick={() => setShowProposeModal(false)}
                                style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', fontWeight: 700, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleSubmitProposal} disabled={!proposeForm.fieldPath.trim() || !proposeForm.proposedValue.trim() || submittingProposal}
                                style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(255,180,50,0.4)', color: 'rgba(255,180,50,0.85)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (!proposeForm.fieldPath.trim() || !proposeForm.proposedValue.trim() || submittingProposal) ? 'default' : 'pointer', opacity: (!proposeForm.fieldPath.trim() || !proposeForm.proposedValue.trim() || submittingProposal) ? 0.4 : 1 }}>
                                {submittingProposal ? 'Submitting…' : 'Submit Proposal'}
                            </button>
                        </div>
                    </div>
                </>
            )}

        </div>
    )
}
