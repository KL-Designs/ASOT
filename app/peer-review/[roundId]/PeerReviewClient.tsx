'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtDuration } from '@/lib/training/peer-review-timers'

const RED = '#db001d'

// ─── Types ───────────────────────────────────────────────────────────────────

type RoundInfo = {
    _id: string
    status: 'draft' | 'sent' | 'unlocked' | 'completed'
    candidateCount: number
    rankingDurationMs: number
    feedbackDurationMs: number
    unlockedAt?: string
}

type Peer = {
    candidateId: string
    candidateNumber: number
    displayName: string
}

type SubStatus = 'waiting' | 'ready' | 'started' | 'ranking_complete' | 'feedback_active' | 'time_expired' | 'submitted'

type SubmissionState = {
    _id: string
    status: SubStatus
    isReady: boolean
    ranking: string[]
    feedback: Record<string, { text: string; noFeedback: boolean }>
    rankingBonusMs: number
    isIncomplete: boolean
    extensions: Array<{
        id: string
        status: 'pending' | 'approved' | 'rejected'
        additionalMs?: number
        currentStage?: 'ranking' | 'feedback'
    }>
}

type ServerData = {
    round: RoundInfo
    submission: SubmissionState
    rankingExpiryAt: number | null
    feedbackExpiryAt: number | null
    peers: Peer[]
}

// ─── Timer hook ──────────────────────────────────────────────────────────────

function useCountdown(expiryAt: number | null): number {
    const [remaining, setRemaining] = useState(0)

    useEffect(() => {
        if (!expiryAt) { setRemaining(0); return }
        const tick = () => setRemaining(Math.max(0, expiryAt - Date.now()))
        tick()
        const id = setInterval(tick, 250)
        return () => clearInterval(id)
    }, [expiryAt])

    return remaining
}

// ─── Audio tick ──────────────────────────────────────────────────────────────

function playTick(urgent: boolean) {
    try {
        type WinWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }
        const AC = window.AudioContext || (window as WinWithWebkit).webkitAudioContext
        if (!AC) return
        const ctx = new AC()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = urgent ? 880 : 660
        const dur = urgent ? 0.12 : 0.22
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + dur)
        osc.onended = () => ctx.close().catch(() => {})
    } catch { /* silently ignore autoplay errors */ }
}

// ─── Timer display component ─────────────────────────────────────────────────

function TimerDisplay({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
    const isDanger  = remainingMs > 0 && remainingMs <= 10000
    const isWarning = !isDanger && remainingMs > 0 && remainingMs <= 60000

    const halfwayShownRef = useRef(false)
    const halfwayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevPctRef      = useRef<number | null>(null)
    const [showHalfway, setShowHalfway] = useState(false)

    useEffect(() => {
        if (halfwayShownRef.current || remainingMs <= 0 || totalMs <= 0) return
        const pct  = remainingMs / totalMs
        const prev = prevPctRef.current
        prevPctRef.current = pct
        // If first render and already past halfway, suppress — user joined mid-round
        if (prev === null && pct < 0.5) { halfwayShownRef.current = true; return }
        if (prev !== null && prev > 0.5 && pct <= 0.5) {
            halfwayShownRef.current = true
            setShowHalfway(true)
            halfwayTimerRef.current = setTimeout(() => setShowHalfway(false), 2500)
        }
    }, [remainingMs, totalMs])

    useEffect(() => () => { if (halfwayTimerRef.current) clearTimeout(halfwayTimerRef.current) }, [])

    const color = isDanger
        ? 'rgba(219,0,29,0.9)'
        : isWarning
        ? 'rgba(255,200,50,0.9)'
        : 'rgba(237,237,237,0.75)'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{
                fontSize: '0.48rem',
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,200,50,0.85)',
                height: '1.2em',
                opacity: showHalfway ? 1 : 0,
                animation: showHalfway ? 'halfwayFade 2.5s ease-out forwards' : 'none',
                pointerEvents: 'none',
            }}>
                Halfway
            </div>
            <div style={{
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 800,
                color,
                padding: '4px 12px',
                border: `1px solid ${isDanger ? 'rgba(219,0,29,0.3)' : isWarning ? 'rgba(255,200,50,0.15)' : 'rgba(255,255,255,0.1)'}`,
                background: isDanger ? 'rgba(219,0,29,0.06)' : 'transparent',
                letterSpacing: '0.05em',
                animation: isDanger ? 'timerFlash 0.5s ease-in-out infinite' : isWarning ? 'timerSlowPulse 3s ease-in-out infinite' : 'none',
                transition: 'color 0.5s, border-color 0.5s',
            }}>
                {fmtDuration(remainingMs)}
            </div>
            <style>{`
                @keyframes timerFlash     { 0%,100%{opacity:1} 50%{opacity:0.35} }
                @keyframes timerSlowPulse { 0%,100%{opacity:1} 50%{opacity:0.78} }
                @keyframes halfwayFade    { 0%{opacity:0;transform:translateY(2px)} 12%{opacity:0.9} 70%{opacity:0.85} 100%{opacity:0} }
                @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
            `}</style>
        </div>
    )
}

// ─── Draggable ranking list ───────────────────────────────────────────────────

function RankingList({
    peers,
    ranking,
    onReorder,
}: {
    peers: Peer[]
    ranking: string[]        // ordered candidateIds
    onReorder: (newOrder: string[]) => void
}) {
    const orderedPeers = ranking
        .map(id => peers.find(p => p.candidateId === id))
        .filter(Boolean) as Peer[]

    const dragIdxRef = useRef<number | null>(null)
    const [activeIdx, setActiveIdx] = useState<number | null>(null)

    function handleDragStart(i: number) {
        dragIdxRef.current = i
        setActiveIdx(i)
    }

    function handleDragOver(e: React.DragEvent, i: number) {
        e.preventDefault()
        if (dragIdxRef.current === null || dragIdxRef.current === i) return
        const next = [...ranking]
        const [moved] = next.splice(dragIdxRef.current, 1)
        next.splice(i, 0, moved)
        dragIdxRef.current = i
        setActiveIdx(i)
        onReorder(next)
    }

    function handleDragEnd() {
        dragIdxRef.current = null
        setActiveIdx(null)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {orderedPeers.map((peer, i) => {
                const isActive = activeIdx === i
                return (
                    <div key={peer.candidateId}>
                        {isActive && (
                            <div style={{ height: 2, background: RED, borderRadius: 1, margin: '2px 0' }} />
                        )}
                        <div
                            draggable
                            onDragStart={() => handleDragStart(i)}
                            onDragOver={e => handleDragOver(e, i)}
                            onDragEnd={handleDragEnd}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                marginBottom: 4,
                                background: isActive ? 'rgba(219,0,29,0.06)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isActive ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                borderLeft: `3px solid ${isActive ? 'rgba(219,0,29,0.75)' : 'transparent'}`,
                                cursor: 'grab',
                                userSelect: 'none',
                                opacity: isActive ? 0.8 : 1,
                                transition: 'background 0.1s, border-color 0.1s, opacity 0.1s',
                            }}
                        >
                            <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 800, color: RED, width: 28, flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', flexShrink: 0 }}>Candidate #{peer.candidateNumber}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', flex: 1 }}>{peer.displayName}</span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.15)', flexShrink: 0 }}>⠿⠿</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
    roundId: string
    myUserId: string
    myName: string
}

export default function PeerReviewClient({ roundId, myUserId: _myUserId, myName: _myName }: Props) {
    const [data, setData] = useState<ServerData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Working copies
    const [ranking, setRanking] = useState<string[]>([])
    const [feedback, setFeedback] = useState<Record<string, { text: string; noFeedback: boolean }>>({})

    const [rankingExpiryAt, setRankingExpiryAt] = useState<number | null>(null)
    const [feedbackExpiryAt, setFeedbackExpiryAt] = useState<number | null>(null)

    const [markingReady, setMarkingReady] = useState(false)
    const [beginning, setBeginning] = useState(false)
    const [completingRanking, setCompletingRanking] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [requestingTime, setRequestingTime] = useState(false)
    const [requestTimeReason, setRequestTimeReason] = useState('')
    const [showRequestTime, setShowRequestTime] = useState(false)
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

    const rankingAutoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const feedbackAutoSaveRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
    const rankingTimedOutRef = useRef(false)
    const feedbackTimedOutRef = useRef(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const rankingZoneRef = useRef<'normal' | 'warning' | 'danger'>('normal')
    const feedbackZoneRef = useRef<'normal' | 'warning' | 'danger'>('normal')

    const rankingRemaining = useCountdown(rankingExpiryAt)
    const feedbackRemaining = useCountdown(feedbackExpiryAt)

    const fetch_ = useCallback(async (opts?: RequestInit) => {
        const res = await fetch(`/api/j3/peer-review/${roundId}`, opts)
        if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d.error ?? 'Not found')
        }
        return res.json() as Promise<ServerData>
    }, [roundId])

    const load = useCallback(async () => {
        try {
            const d = await fetch_()
            setData(d)
            setRankingExpiryAt(d.rankingExpiryAt)
            setFeedbackExpiryAt(d.feedbackExpiryAt)
            // Only set local copies on first load or if not already started
            if (!data) {
                const initRanking = d.submission.ranking.length > 0
                    ? d.submission.ranking
                    : d.peers.map(p => p.candidateId)
                setRanking(initRanking)
                setFeedback(d.submission.feedback ?? {})
            }
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roundId])

    useEffect(() => {
        load()
        // Poll round status every 10s (for unlock detection in waiting room)
        pollRef.current = setInterval(load, 10000)
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [load])

    // ── Ranking timer expiry ──────────────────────────────────────────────────
    useEffect(() => {
        if (data?.submission.status !== 'started') return
        if (rankingRemaining !== 0 || rankingTimedOutRef.current) return
        rankingTimedOutRef.current = true
        // Auto-complete ranking on expiry
        handleCompleteRanking(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rankingRemaining, data?.submission.status])

    // ── Audio tick — ranking ──────────────────────────────────────────────────
    useEffect(() => {
        if (data?.submission.status !== 'started' || !rankingExpiryAt) return
        const zone: 'normal' | 'warning' | 'danger' = rankingRemaining <= 10000 ? 'danger' : rankingRemaining <= 60000 ? 'warning' : 'normal'
        if (zone !== rankingZoneRef.current) {
            const prev = rankingZoneRef.current
            rankingZoneRef.current = zone
            if (zone === 'danger' || (zone === 'warning' && prev === 'normal')) playTick(zone === 'danger')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rankingRemaining])

    // ── Audio tick — feedback ─────────────────────────────────────────────────
    useEffect(() => {
        if (data?.submission.status !== 'feedback_active' || !feedbackExpiryAt) return
        const zone: 'normal' | 'warning' | 'danger' = feedbackRemaining <= 10000 ? 'danger' : feedbackRemaining <= 60000 ? 'warning' : 'normal'
        if (zone !== feedbackZoneRef.current) {
            const prev = feedbackZoneRef.current
            feedbackZoneRef.current = zone
            if (zone === 'danger' || (zone === 'warning' && prev === 'normal')) playTick(zone === 'danger')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feedbackRemaining])

    // ── Feedback timer expiry ─────────────────────────────────────────────────
    useEffect(() => {
        if (!['feedback_active'].includes(data?.submission.status ?? '')) return
        if (feedbackRemaining !== 0 || feedbackTimedOutRef.current) return
        feedbackTimedOutRef.current = true
        // Save current feedback state + mark time_expired
        fetch(`/api/j3/peer-review/${roundId}/feedback`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback, timedOut: true }),
        }).then(() => load()).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feedbackRemaining, data?.submission.status])

    // ── Ranking autosave ──────────────────────────────────────────────────────
    function handleRankingChange(newOrder: string[]) {
        setRanking(newOrder)
        if (rankingAutoSaveRef.current) clearTimeout(rankingAutoSaveRef.current)
        rankingAutoSaveRef.current = setTimeout(() => {
            fetch(`/api/j3/peer-review/${roundId}/ranking`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ranking: newOrder }),
            }).catch(() => {})
        }, 1000)
    }

    // ── Feedback autosave ─────────────────────────────────────────────────────
    function handleFeedbackChange(cid: string, field: 'text' | 'noFeedback', value: string | boolean) {
        const next = {
            ...feedback,
            [cid]: {
                text: feedback[cid]?.text ?? '',
                noFeedback: feedback[cid]?.noFeedback ?? false,
                [field]: value,
            },
        }
        setFeedback(next)
        const existing = feedbackAutoSaveRef.current.get(cid)
        if (existing) clearTimeout(existing)
        const t = setTimeout(() => {
            fetch(`/api/j3/peer-review/${roundId}/feedback`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback: next }),
            }).catch(() => {})
            feedbackAutoSaveRef.current.delete(cid)
        }, 800)
        feedbackAutoSaveRef.current.set(cid, t)
    }

    async function handleMarkReady() {
        if (markingReady) return
        setMarkingReady(true)
        try {
            await fetch(`/api/j3/peer-review/${roundId}/ready`, { method: 'POST' })
            await load()
        } finally { setMarkingReady(false) }
    }

    async function handleBegin() {
        if (beginning) return
        setBeginning(true)
        try {
            const res = await fetch(`/api/j3/peer-review/${roundId}/begin`, { method: 'POST' })
            if (res.ok) {
                const d = await res.json()
                setRankingExpiryAt(d.rankingExpiryAt)
                await load()
            }
        } finally { setBeginning(false) }
    }

    async function handleCompleteRanking(timedOut = false) {
        if (completingRanking) return
        setCompletingRanking(true)
        try {
            const res = await fetch(`/api/j3/peer-review/${roundId}/ranking/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ranking, timedOut }),
            })
            if (res.ok) {
                const d = await res.json()
                setFeedbackExpiryAt(d.feedbackExpiryAt)
                await load()
            }
        } finally { setCompletingRanking(false) }
    }

    async function handleRequestTime() {
        if (requestingTime) return
        setRequestingTime(true)
        try {
            await fetch(`/api/j3/peer-review/${roundId}/request-time`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: requestTimeReason }),
            })
            setShowRequestTime(false)
            setRequestTimeReason('')
            await load()
        } finally { setRequestingTime(false) }
    }

    async function handleSubmit() {
        if (submitting) return
        setSubmitting(true)
        try {
            // Save latest feedback first
            await fetch(`/api/j3/peer-review/${roundId}/feedback`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback }),
            })
            const res = await fetch(`/api/j3/peer-review/${roundId}/submit`, { method: 'POST' })
            if (res.ok) {
                setShowSubmitConfirm(false)
                await load()
            } else {
                const d = await res.json().catch(() => ({}))
                setError(d.error ?? 'Submit failed')
            }
        } finally { setSubmitting(false) }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'rgba(237,237,237,0.25)', fontSize: '0.75rem' }}>
                Loading…
            </div>
        )
    }

    if (error || !data) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.7)' }}>{error ?? 'Not found'}</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)' }}>Check that you are using the correct link.</div>
            </div>
        )
    }

    const { round, submission, peers } = data
    const status = submission.status

    const pendingExtension = submission.extensions.find(e => e.status === 'pending')
    const approvedFeedbackExtMs = submission.extensions
        .filter(e => e.status === 'approved' && e.currentStage === 'feedback')
        .reduce((sum, e) => sum + (e.additionalMs ?? 0), 0)

    const totalRankingMs = round.rankingDurationMs
    const totalFeedbackMs = round.feedbackDurationMs + submission.rankingBonusMs + approvedFeedbackExtMs

    // ── Submitted ─────────────────────────────────────────────────────────────
    if (status === 'submitted') {
        return (
            <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.6)', marginBottom: 12 }}>Submitted</div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'rgba(237,237,237,0.9)', margin: '0 0 16px' }}>Peer Review Complete</h1>
                <p style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.7 }}>
                    Your peer review has been submitted successfully. You can close this window.
                </p>
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 0, background: '#0a0a0a', minHeight: '100vh' }}>

            {/* Header */}
            <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 6 }}>Peer Review</div>
                <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                    {status === 'waiting' || status === 'ready' ? 'Waiting Room' : status === 'started' ? 'Rank Your Peers' : status === 'ranking_complete' || status === 'feedback_active' || status === 'time_expired' ? 'Provide Feedback' : 'Peer Review'}
                </h1>
            </div>

            {/* ── Waiting Room ──────────────────────────────────────────────────── */}
            {(status === 'waiting' || status === 'ready') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.8 }}>
                        <p style={{ margin: '0 0 10px' }}>
                            You are about to complete a <strong style={{ color: 'rgba(237,237,237,0.8)' }}>peer ranking and feedback exercise</strong>. You will be asked to rank your fellow candidates from best to worst, then provide written feedback on each one.
                        </p>
                        <p style={{ margin: '0 0 10px' }}>
                            <strong style={{ color: 'rgba(237,237,237,0.8)' }}>Ranking</strong> — Drag candidates into your preferred order. You have <strong style={{ color: 'rgba(255,180,50,0.8)' }}>{fmtDuration(round.rankingDurationMs)}</strong> to rank all {round.candidateCount} candidates.
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong style={{ color: 'rgba(237,237,237,0.8)' }}>Feedback</strong> — After ranking, write brief observations for each candidate. Unused ranking time carries over. All responses are <strong style={{ color: 'rgba(237,237,237,0.8)' }}>strictly confidential</strong> — no candidate sees another's submission.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!submission.isReady ? (
                            <button type='button' onClick={handleMarkReady} disabled={markingReady}
                                style={{ padding: '10px 24px', background: 'rgba(100,160,240,0.08)', border: '1px solid rgba(100,160,240,0.3)', color: 'rgba(100,160,240,0.9)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: markingReady ? 'default' : 'pointer', opacity: markingReady ? 0.5 : 1 }}>
                                {markingReady ? 'Marking…' : "I'm Ready"}
                            </button>
                        ) : (
                            <div style={{ padding: '6px 14px', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.7)', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Marked Ready</div>
                        )}

                        <button
                            type='button'
                            onClick={handleBegin}
                            disabled={beginning || round.status !== 'unlocked'}
                            style={{ padding: '10px 24px', background: round.status === 'unlocked' ? 'rgba(219,0,29,0.08)' : 'transparent', border: `1px solid ${round.status === 'unlocked' ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.1)'}`, color: round.status === 'unlocked' ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.2)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: round.status !== 'unlocked' || beginning ? 'default' : 'pointer' }}>
                            {beginning ? 'Starting…' : round.status === 'unlocked' ? 'Begin →' : 'Waiting for instructor…'}
                        </button>
                    </div>
                    {round.status !== 'unlocked' && (
                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>The Begin button will activate once the instructor unlocks the round for everyone.</div>
                    )}
                </div>
            )}

            {/* ── Ranking View ──────────────────────────────────────────────────── */}
            {status === 'started' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Timer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>Drag to reorder — best candidate first.</div>
                        <TimerDisplay remainingMs={rankingRemaining} totalMs={totalRankingMs} />
                    </div>

                    {/* Brief instruction */}
                    <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.63rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.7 }}>
                        Rank all {peers.length} candidates by dragging them into order — <strong style={{ color: 'rgba(237,237,237,0.7)' }}>1st place</strong> is the best performer. Your ranking is strictly confidential and will not be shared with other candidates.
                    </div>

                    <RankingList peers={peers} ranking={ranking} onReorder={handleRankingChange} />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type='button' onClick={() => handleCompleteRanking(false)} disabled={completingRanking}
                            style={{ padding: '10px 24px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.9)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: completingRanking ? 'default' : 'pointer', opacity: completingRanking ? 0.5 : 1 }}>
                            {completingRanking ? 'Saving…' : 'Next — Feedback →'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Feedback View ──────────────────────────────────────────────────── */}
            {(status === 'feedback_active' || status === 'ranking_complete' || status === 'time_expired') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Timer + bonus */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                                Write observations for each candidate. All responses are confidential.
                            </div>
                            {submission.rankingBonusMs > 0 && (
                                <div style={{ fontSize: '0.52rem', color: 'rgba(80,200,120,0.6)' }}>
                                    +{fmtDuration(submission.rankingBonusMs)} bonus from unused ranking time
                                </div>
                            )}
                        </div>
                        {status !== 'time_expired' && feedbackExpiryAt && (
                            <TimerDisplay remainingMs={feedbackRemaining} totalMs={totalFeedbackMs} />
                        )}
                        {status === 'time_expired' && (
                            <div style={{ padding: '4px 12px', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.7)', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Time Expired</div>
                        )}
                    </div>

                    {/* Incomplete ranking warning */}
                    {submission.isIncomplete && (
                        <div style={{ padding: '8px 12px', background: 'rgba(255,180,50,0.05)', border: '1px solid rgba(255,180,50,0.2)', fontSize: '0.6rem', color: 'rgba(255,180,50,0.7)' }}>
                            Your ranking was incomplete when time expired. Unranked candidates were placed at the bottom automatically.
                        </div>
                    )}

                    {/* Per-candidate feedback */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {peers
                            .sort((a, b) => a.candidateNumber - b.candidateNumber)
                            .map((peer, rankPos) => {
                                const fb = feedback[peer.candidateId] ?? { text: '', noFeedback: false }
                                const rankIdx = ranking.indexOf(peer.candidateId)
                                const locked = status === 'time_expired' && !submission.extensions.some(e => e.status === 'approved' && e.currentStage === 'feedback')

                                return (
                                    <div key={peer.candidateId} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>#{peer.candidateNumber}</span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', flex: 1 }}>{peer.displayName}</span>
                                            {rankIdx >= 0 && (
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.5rem', color: 'rgba(219,0,29,0.5)' }}>Ranked #{rankIdx + 1}</span>
                                            )}
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: locked ? 'default' : 'pointer' }}>
                                            <input
                                                type='checkbox'
                                                checked={fb.noFeedback}
                                                disabled={locked}
                                                onChange={e => handleFeedbackChange(peer.candidateId, 'noFeedback', e.target.checked)}
                                                style={{ accentColor: RED }}
                                            />
                                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.45)' }}>No Feedback to Provide</span>
                                        </label>

                                        {!fb.noFeedback && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>Observations</span>
                                                    <span style={{ fontSize: '0.44rem', color: (fb.text?.length ?? 0) > 280 ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.2)' }}>{fb.text?.length ?? 0}/300</span>
                                                </div>
                                                <textarea
                                                    value={fb.text}
                                                    maxLength={300}
                                                    disabled={locked}
                                                    onChange={e => handleFeedbackChange(peer.candidateId, 'text', e.target.value)}
                                                    placeholder='Write your observations here…'
                                                    rows={3}
                                                    style={{ width: '100%', boxSizing: 'border-box', background: locked ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(219,0,29,0.2)', color: 'rgba(237,237,237,0.8)', fontSize: '0.72rem', padding: '7px 9px', outline: 'none', resize: 'vertical', minHeight: 70, fontFamily: 'inherit', lineHeight: 1.5, opacity: locked ? 0.5 : 1 }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                    </div>

                    {/* Submit area */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {!showSubmitConfirm ? (
                            <>
                                <button type='button' onClick={() => setShowSubmitConfirm(true)}
                                    style={{ padding: '10px 24px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.9)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                    Submit Peer Review
                                </button>
                                {!pendingExtension && (
                                    <button type='button' onClick={() => setShowRequestTime(s => !s)}
                                        style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        Request Additional Time
                                    </button>
                                )}
                                {pendingExtension && (
                                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,180,50,0.7)', fontStyle: 'italic' }}>Time extension pending approval…</div>
                                )}
                            </>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>
                                    Once submitted, you cannot edit this peer review unless an instructor reopens it. Are you sure?
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type='button' onClick={handleSubmit} disabled={submitting}
                                        style={{ padding: '8px 20px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.35)', color: 'rgba(80,200,120,0.9)', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.5 : 1 }}>
                                        {submitting ? 'Submitting…' : 'Confirm Submit'}
                                    </button>
                                    <button type='button' onClick={() => setShowSubmitConfirm(false)}
                                        style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {showRequestTime && (
                        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Reason for Request (optional)</div>
                            <textarea
                                value={requestTimeReason}
                                onChange={e => setRequestTimeReason(e.target.value)}
                                placeholder='Briefly explain why you need more time…'
                                rows={2}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(255,180,50,0.3)', color: 'rgba(237,237,237,0.8)', fontSize: '0.65rem', padding: '7px 9px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button type='button' onClick={handleRequestTime} disabled={requestingTime}
                                    style={{ padding: '6px 16px', background: 'rgba(255,180,50,0.08)', border: '1px solid rgba(255,180,50,0.3)', color: 'rgba(255,180,50,0.85)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: requestingTime ? 'default' : 'pointer', opacity: requestingTime ? 0.5 : 1 }}>
                                    {requestingTime ? 'Sending…' : 'Send Request'}
                                </button>
                                <button type='button' onClick={() => setShowRequestTime(false)}
                                    style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.58rem', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={{ fontSize: '0.62rem', color: 'rgba(219,0,29,0.7)' }}>{error}</div>
                    )}
                </div>
            )}
        </div>
    )
}
