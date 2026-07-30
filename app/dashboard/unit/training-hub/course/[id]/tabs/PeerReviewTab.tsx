'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { calcTimers, fmtDuration } from '@/lib/training/peer-review-timers'

const RED = '#db001d'

type TCandidate = {
    _id: string
    candidateNumber: number
    displayName: string
    status: string
}

type TRound = {
    _id: string
    status: 'draft' | 'sent' | 'unlocked' | 'completed'
    selectedCandidateIds: string[]
    candidateCount: number
    rankingDurationMs: number
    feedbackDurationMs: number
    sentAt?: string
    unlockedAt?: string
    completedAt?: string
}

type TSub = {
    _id: string
    reviewerCandidateId: string
    reviewerCandidateNumber: number
    reviewerDisplayName: string
    status: string
    hasOpenedWaitingRoom: boolean
    isReady: boolean
    rankingStartedAt?: string
    rankingCompletedAt?: string
    feedbackStartedAt?: string
    submittedAt?: string
    isIncomplete: boolean
    extensions: Array<{
        id: string
        requestedAt: string
        reason?: string
        status: 'pending' | 'approved' | 'rejected'
        decidedAt?: string
        additionalMs?: number
        currentStage?: 'ranking' | 'feedback'
    }>
    rankingUsedMs?: number
    feedbackUsedMs?: number
}

type TBordaEntry = {
    candidateId: string
    displayName: string
    candidateNumber: number
    totalScore: number
    averageRank: number
    validReviewCount: number
    firstPlaceCount: number
    selfRankedFirst: boolean
    tied: boolean
}

const STATUS_LABELS: Record<string, string> = {
    waiting:          'Waiting',
    ready:            'Ready',
    started:          'Ranking',
    ranking_complete: 'Ranking Done',
    feedback_active:  'Feedback',
    time_expired:     'Timed Out',
    submitted:        'Submitted',
}

const STATUS_COLORS: Record<string, string> = {
    waiting:          'rgba(237,237,237,0.3)',
    ready:            'rgba(100,160,240,0.8)',
    started:          'rgba(255,180,50,0.8)',
    ranking_complete: 'rgba(255,180,50,0.8)',
    feedback_active:  'rgba(255,180,50,0.8)',
    time_expired:     'rgba(219,0,29,0.7)',
    submitted:        'rgba(80,200,120,0.8)',
}

function fmtMs(ms?: number) {
    if (!ms) return '—'
    return fmtDuration(ms)
}

interface Props {
    courseInstanceId: string
    candidates: TCandidate[]
}

export default function PeerReviewTab({ courseInstanceId, candidates }: Props) {
    const [round, setRound] = useState<TRound | null>(null)
    const [submissions, setSubmissions] = useState<TSub[]>([])
    const [results, setResults] = useState<TBordaEntry[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [section, setSection] = useState<'setup' | 'waiting' | 'progress' | 'results'>('setup')

    // Setup state
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [creating, setCreating] = useState(false)
    const [sending, setSending] = useState(false)
    const [unlocking, setUnlocking] = useState(false)

    // Extension approval state
    const [extAction, setExtAction] = useState<{ subId: string; extId: string; ms: number } | null>(null)
    const [approvingExt, setApprovingExt] = useState(false)

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const lastRoundStatus = useRef<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review`)
            const d = await res.json()
            setRound(d.round ?? null)
            setSubmissions(d.submissions ?? [])

            // Auto-navigate only when round status changes (prevents poll overriding manual tab selection)
            if (d.round) {
                const s = d.round.status
                if (lastRoundStatus.current !== s) {
                    lastRoundStatus.current = s
                    if (s === 'draft' || s === 'completed') setSection('setup')
                    else if (s === 'sent') setSection('waiting')
                    else if (s === 'unlocked') setSection('progress')
                }
            }
        } catch { /* ignore */ } finally {
            setLoading(false)
        }
    }, [courseInstanceId])

    useEffect(() => {
        load()
        pollRef.current = setInterval(load, 10000)
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [load])

    async function loadResults() {
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review/results`)
            if (res.ok) {
                const d = await res.json()
                setResults(d.results)
            }
        } catch { /* ignore */ }
    }

    useEffect(() => {
        if (section === 'results') loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, courseInstanceId])

    // Init selection from active candidates
    useEffect(() => {
        if (!round) {
            const activeCandidates = candidates.filter(c => c.status === 'active')
            setSelected(new Set(activeCandidates.map(c => c._id)))
        }
    }, [candidates, round])

    async function handleCreate() {
        if (creating || selected.size < 2) return
        setCreating(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedCandidateIds: Array.from(selected) }),
            })
            if (res.ok) await load()
        } finally { setCreating(false) }
    }

    async function handleSend() {
        if (sending) return
        setSending(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review/send`, { method: 'POST' })
            if (res.ok) { await load(); setSection('waiting') }
        } finally { setSending(false) }
    }

    async function handleUnlock() {
        if (unlocking) return
        setUnlocking(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review/unlock`, { method: 'POST' })
            if (res.ok) { await load(); setSection('progress') }
        } finally { setUnlocking(false) }
    }

    async function handleExtension(subId: string, extId: string, action: 'approve' | 'reject', ms: number) {
        setApprovingExt(true)
        try {
            await fetch(`/api/j3/course-instances/${courseInstanceId}/peer-review/submissions/${subId}/extension`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, extensionId: extId, additionalMs: ms }),
            })
            setExtAction(null)
            await load()
        } finally { setApprovingExt(false) }
    }

    const { rankingMs, feedbackMs } = calcTimers(selected.size)
    const readyCount = submissions.filter(s => s.isReady).length
    const submittedCount = submissions.filter(s => s.status === 'submitted').length
    const pendingExtensions = submissions.flatMap(s =>
        s.extensions.filter(e => e.status === 'pending').map(e => ({ sub: s, ext: e }))
    )

    const tabStyle = (active: boolean) => ({
        padding: '4px 12px',
        background: active ? 'rgba(219,0,29,0.1)' : 'transparent',
        border: `1px solid ${active ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.4)',
        fontSize: '0.55rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
    })

    if (loading) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Section tabs */}
            {round && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type='button' onClick={() => setSection('setup')} style={tabStyle(section === 'setup')}>Setup</button>
                    {['sent', 'unlocked', 'completed'].includes(round.status) && (
                        <button type='button' onClick={() => setSection('waiting')} style={tabStyle(section === 'waiting')}>Waiting Room</button>
                    )}
                    {['unlocked', 'completed'].includes(round.status) && (
                        <button type='button' onClick={() => setSection('progress')} style={tabStyle(section === 'progress')}>
                            Progress
                            {pendingExtensions.length > 0 && (
                                <span style={{ marginLeft: 5, background: RED, color: '#fff', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.4rem', fontWeight: 900 }}>
                                    {pendingExtensions.length}
                                </span>
                            )}
                        </button>
                    )}
                    {submissions.length > 0 && (
                        <button type='button' onClick={() => setSection('results')} style={tabStyle(section === 'results')}>Results</button>
                    )}
                </div>
            )}

            {/* ── Setup Section ── */}
            {section === 'setup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {round?.status === 'completed' ? (
                        <div style={{ padding: '12px 16px', background: 'rgba(80,200,120,0.05)', border: '1px solid rgba(80,200,120,0.15)', fontSize: '0.7rem', color: 'rgba(80,200,120,0.7)' }}>
                            Peer review round completed. {submittedCount} of {round.candidateCount} candidates submitted.
                        </div>
                    ) : round ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 8 }}>Active Round</div>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Candidates</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{round.candidateCount}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ranking Time</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{fmtDuration(round.rankingDurationMs)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Feedback Time</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{fmtDuration(round.feedbackDurationMs)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Status</div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: round.status === 'sent' ? 'rgba(255,180,50,0.8)' : 'rgba(80,200,120,0.8)' }}>{round.status}</div>
                                    </div>
                                </div>
                            </div>
                            {round.status === 'draft' && (
                                <button type='button' onClick={handleSend} disabled={sending}
                                    style={{ alignSelf: 'flex-start', padding: '7px 18px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.85)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.5 : 1 }}>
                                    {sending ? 'Sending…' : 'Send to Candidates →'}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Candidate selector */}
                            <div>
                                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 10 }}>
                                    Select Candidates ({selected.size} selected)
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {candidates.map(c => {
                                        const isSelected = selected.has(c._id)
                                        return (
                                            <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: isSelected ? 'rgba(219,0,29,0.04)' : 'rgba(255,255,255,0.01)', border: `1px solid ${isSelected ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', userSelect: 'none' }}>
                                                <input
                                                    type='checkbox'
                                                    checked={isSelected}
                                                    onChange={e => {
                                                        setSelected(prev => {
                                                            const next = new Set(prev)
                                                            if (e.target.checked) next.add(c._id)
                                                            else next.delete(c._id)
                                                            return next
                                                        })
                                                    }}
                                                    style={{ accentColor: RED }}
                                                />
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{c.candidateNumber}</span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', flex: 1 }}>{c.displayName}</span>
                                                <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.status === 'active' ? 'rgba(80,200,120,0.6)' : 'rgba(237,237,237,0.2)' }}>{c.status}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Timer preview */}
                            {selected.size >= 2 && (
                                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 24 }}>
                                    <div>
                                        <div style={{ fontSize: '0.44rem', color: 'rgba(237,237,237,0.3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ranking Timer</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'rgba(237,237,237,0.75)', fontFamily: 'monospace' }}>{fmtDuration(rankingMs)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.44rem', color: 'rgba(237,237,237,0.3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Feedback Timer</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'rgba(237,237,237,0.75)', fontFamily: 'monospace' }}>{fmtDuration(feedbackMs)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.44rem', color: 'rgba(237,237,237,0.3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Candidates</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'rgba(237,237,237,0.75)', fontFamily: 'monospace' }}>{selected.size}</div>
                                    </div>
                                </div>
                            )}

                            <button type='button' onClick={handleCreate} disabled={creating || selected.size < 2}
                                style={{ alignSelf: 'flex-start', padding: '7px 18px', background: selected.size >= 2 ? 'rgba(219,0,29,0.08)' : 'transparent', border: `1px solid ${selected.size >= 2 ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.1)'}`, color: selected.size >= 2 ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.2)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: creating || selected.size < 2 ? 'default' : 'pointer', opacity: creating ? 0.5 : 1 }}>
                                {creating ? 'Creating…' : selected.size < 2 ? 'Select at least 2 candidates' : 'Create & Send →'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Waiting Room Section ── */}
            {section === 'waiting' && round && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)' }}>
                            <span style={{ fontWeight: 700, color: 'rgba(100,160,240,0.9)' }}>{readyCount}</span>
                            <span style={{ color: 'rgba(237,237,237,0.3)' }}> of {submissions.length} ready</span>
                        </div>
                        {round.status === 'sent' && (
                            <button type='button' onClick={handleUnlock} disabled={unlocking}
                                style={{ padding: '6px 16px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.85)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: unlocking ? 'default' : 'pointer', opacity: unlocking ? 0.5 : 1 }}>
                                {unlocking ? 'Unlocking…' : 'Unlock for Everyone →'}
                            </button>
                        )}
                        {round.status === 'unlocked' && (
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)', border: '1px solid rgba(80,200,120,0.2)', padding: '3px 10px' }}>Unlocked</div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {submissions.map(s => (
                            <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto auto auto', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{s.reviewerCandidateNumber}</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.75)' }}>{s.reviewerDisplayName}</span>
                                <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.hasOpenedWaitingRoom ? 'rgba(100,160,240,0.7)' : 'rgba(237,237,237,0.2)', border: `1px solid ${s.hasOpenedWaitingRoom ? 'rgba(100,160,240,0.2)' : 'rgba(255,255,255,0.06)'}`, padding: '1px 5px' }}>
                                    {s.hasOpenedWaitingRoom ? 'In Room' : 'Not Opened'}
                                </span>
                                <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.isReady ? 'rgba(80,200,120,0.8)' : 'rgba(237,237,237,0.2)', border: `1px solid ${s.isReady ? 'rgba(80,200,120,0.2)' : 'rgba(255,255,255,0.06)'}`, padding: '1px 5px' }}>
                                    {s.isReady ? 'Ready' : 'Not Ready'}
                                </span>
                                <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: STATUS_COLORS[s.status] ?? 'rgba(237,237,237,0.3)', padding: '1px 5px' }}>
                                    {STATUS_LABELS[s.status] ?? s.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Progress Section ── */}
            {section === 'progress' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Pending extensions */}
                    {pendingExtensions.length > 0 && (
                        <div style={{ padding: '12px 14px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.2)' }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 10 }}>Pending Time Requests</div>
                            {pendingExtensions.map(({ sub, ext }) => (
                                <div key={ext.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{sub.reviewerCandidateNumber}</span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(237,237,237,0.7)', flex: 1 }}>{sub.reviewerDisplayName}</span>
                                    <span style={{ fontSize: '0.5rem', color: 'rgba(255,180,50,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{ext.currentStage} stage</span>
                                    {ext.reason && <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic' }}>&ldquo;{ext.reason}&rdquo;</span>}

                                    {extAction?.extId === ext.id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.4)' }}>Minutes:</span>
                                            <input
                                                type='number'
                                                min={1}
                                                max={30}
                                                value={extAction.ms / 60000}
                                                onChange={e => setExtAction(prev => prev ? { ...prev, ms: Number(e.target.value) * 60000 } : null)}
                                                style={{ width: 50, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.8)', fontSize: '0.65rem', padding: '3px 6px', outline: 'none' }}
                                            />
                                            <button type='button' disabled={approvingExt} onClick={() => handleExtension(sub._id, ext.id, 'approve', extAction.ms)}
                                                style={{ padding: '2px 8px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.8)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                Approve
                                            </button>
                                            <button type='button' disabled={approvingExt} onClick={() => handleExtension(sub._id, ext.id, 'reject', 0)}
                                                style={{ padding: '2px 8px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.6)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                Deny
                                            </button>
                                            <button type='button' onClick={() => setExtAction(null)}
                                                style={{ padding: '2px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.44rem', cursor: 'pointer' }}>
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <button type='button' onClick={() => setExtAction({ subId: sub._id, extId: ext.id, ms: 5 * 60000 })}
                                            style={{ padding: '2px 8px', background: 'transparent', border: '1px solid rgba(255,180,50,0.25)', color: 'rgba(255,180,50,0.7)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                            Respond
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Submission progress table */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {submissions.map(s => {
                            const statusColor = STATUS_COLORS[s.status] ?? 'rgba(237,237,237,0.3)'
                            return (
                                <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto auto auto', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{s.reviewerCandidateNumber}</span>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.75)' }}>{s.reviewerDisplayName}</div>
                                        {s.isIncomplete && <div style={{ fontSize: '0.44rem', color: 'rgba(255,180,50,0.6)', fontWeight: 700, letterSpacing: '0.08em' }}>Incomplete ranking — candidates auto-placed</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {s.rankingUsedMs !== undefined && <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)' }}>Ranking: {fmtMs(s.rankingUsedMs)}</div>}
                                        {s.feedbackUsedMs !== undefined && s.feedbackUsedMs > 0 && <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.3)' }}>Feedback: {fmtMs(s.feedbackUsedMs)}</div>}
                                    </div>
                                    {s.extensions.some(e => e.status === 'pending') && (
                                        <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.2)', padding: '1px 5px', textTransform: 'uppercase' }}>Ext Pending</span>
                                    )}
                                    <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor, border: `1px solid ${statusColor.replace('0.8', '0.2').replace('0.7', '0.2').replace('0.3', '0.1')}`, padding: '2px 6px', flexShrink: 0 }}>
                                        {STATUS_LABELS[s.status] ?? s.status}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Results Section ── */}
            {section === 'results' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                        Borda Score Results
                    </div>
                    {results === null ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading results…</div>
                    ) : results.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No results yet.</div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '28px 110px 1fr 72px 88px 88px 80px 72px', gap: 8, padding: '4px 12px', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <span>#</span>
                                <span>Candidate No.</span>
                                <span>Name</span>
                                <span style={{ textAlign: 'center' }}>Score</span>
                                <span style={{ textAlign: 'center' }}>Avg Rank</span>
                                <span style={{ textAlign: 'center' }}>1st Place</span>
                                <span style={{ textAlign: 'center' }}>Reviews</span>
                                <span style={{ textAlign: 'center' }}>Flags</span>
                            </div>
                            {results.map((r, i) => (
                                <div key={r.candidateId} style={{ display: 'grid', gridTemplateColumns: '28px 110px 1fr 72px 88px 88px 80px 72px', gap: 8, padding: '8px 12px', background: r.tied ? 'rgba(255,180,50,0.03)' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>{i + 1}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{r.candidateNumber}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{r.displayName}</span>
                                        {r.tied && <span style={{ fontSize: '0.42rem', fontWeight: 800, color: 'rgba(255,180,50,0.7)', border: '1px solid rgba(255,180,50,0.2)', padding: '0 4px' }}>TIE</span>}
                                    </div>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(237,237,237,0.9)', fontFamily: 'monospace', textAlign: 'center' }}>{r.totalScore}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>{r.averageRank > 0 ? r.averageRank.toFixed(1) : '—'}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>{r.firstPlaceCount}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>{r.validReviewCount}</span>
                                    <div style={{ textAlign: 'center' }}>
                                        {r.selfRankedFirst && <span style={{ fontSize: '0.4rem', color: 'rgba(255,180,50,0.5)', fontWeight: 700 }}>self-1st</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
