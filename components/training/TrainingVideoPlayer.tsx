'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import PlayArrowIcon      from '@mui/icons-material/PlayArrow'
import PauseIcon          from '@mui/icons-material/Pause'
import ReplayIcon         from '@mui/icons-material/Replay'
import CheckCircleIcon    from '@mui/icons-material/CheckCircle'
import WarningAmberIcon   from '@mui/icons-material/WarningAmber'
import LockIcon           from '@mui/icons-material/Lock'

const RED    = '#db001d'
const DARK   = 'rgba(10,10,10,0.96)'
const BORDER = 'rgba(255,255,255,0.1)'
const TEXT   = 'rgba(237,237,237,0.88)'
const MUTED  = 'rgba(237,237,237,0.35)'

function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
}

interface CheckpointState {
    checkpointId: string
    passed: boolean
    attempts: number
    canSkip: boolean   // true after 3rd fail
}

interface Props {
    video: TrainingTypeVideo
    myProgress: TrainingVideoProgress | null
    onProgressUpdate: (update: { lastPositionSeconds?: number; checkpointResult?: { checkpointId: string; passed: boolean }; completed?: boolean }) => Promise<void>
    onWrittenReview: (checkpointId: string, answer: string) => Promise<{ passed: boolean; feedback: string }>
    isTrainer?: boolean
}

export default function TrainingVideoPlayer({ video, myProgress, onProgressUpdate, onWrittenReview, isTrainer }: Props) {
    const videoRef    = useRef<HTMLVideoElement>(null)
    const saveTimer   = useRef<NodeJS.Timeout | null>(null)

    const [playing,    setPlaying]    = useState(false)
    const [duration,   setDuration]   = useState(0)
    const [position,   setPosition]   = useState(0)
    const [seeking,    setSeeking]    = useState(false)
    const [fadeOpaque, setFadeOpaque] = useState(false)

    // Checkpoint overlay state
    const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null)
    const [selectedOption,     setSelectedOption]      = useState<number | null>(null)
    const [writtenAnswer,      setWrittenAnswer]       = useState('')
    const [reviewing,          setReviewing]           = useState(false)
    const [feedback,           setFeedback]            = useState<{ passed: boolean; text: string } | null>(null)

    // Per-checkpoint pass/fail/attempt tracking (local mirror of myProgress)
    const [cpStates, setCpStates] = useState<Record<string, CheckpointState>>(() => {
        const map: Record<string, CheckpointState> = {}
        for (const cp of video.checkpoints) {
            const prog = myProgress?.checkpoints.find(c => c.checkpointId === cp.id)
            map[cp.id] = {
                checkpointId: cp.id,
                passed: prog?.passed ?? false,
                attempts: prog?.attempts ?? 0,
                canSkip: (prog?.attempts ?? 0) >= 3,
            }
        }
        return map
    })

    // Sorted checkpoints by timestamp
    const sorted = [...video.checkpoints].sort((a, b) => a.timestampSeconds - b.timestampSeconds)

    // Set initial position from saved progress
    useEffect(() => {
        if (!videoRef.current) return
        const saved = myProgress?.lastPositionSeconds ?? 0
        if (saved > 5) videoRef.current.currentTime = saved
    }, [myProgress?.lastPositionSeconds])

    // Autosave position every 5s during playback
    const savePosition = useCallback(() => {
        if (!videoRef.current) return
        onProgressUpdate({ lastPositionSeconds: Math.floor(videoRef.current.currentTime) }).catch(() => {})
    }, [onProgressUpdate])

    useEffect(() => {
        if (playing) {
            saveTimer.current = setInterval(savePosition, 5000)
        } else {
            if (saveTimer.current) clearInterval(saveTimer.current)
        }
        return () => { if (saveTimer.current) clearInterval(saveTimer.current) }
    }, [playing, savePosition])

    // Check for checkpoint triggers on timeupdate
    function handleTimeUpdate() {
        if (!videoRef.current || activeCheckpointId) return
        const t = videoRef.current.currentTime

        for (const cp of sorted) {
            const state = cpStates[cp.id]
            if (state?.passed) continue
            if (state?.canSkip) continue
            if (t >= cp.timestampSeconds) {
                videoRef.current.pause()
                videoRef.current.currentTime = cp.timestampSeconds
                setPlaying(false)
                setActiveCheckpointId(cp.id)
                setSelectedOption(null)
                setWrittenAnswer('')
                setFeedback(null)
                return
            }
        }

        setPosition(t)
    }

    function handleLoadedMetadata() {
        if (videoRef.current) setDuration(videoRef.current.duration)
    }

    function togglePlay() {
        if (!videoRef.current || activeCheckpointId) return
        if (playing) {
            videoRef.current.pause()
            setPlaying(false)
            savePosition()
        } else {
            videoRef.current.play()
            setPlaying(true)
        }
    }

    function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
        if (!videoRef.current) return
        const t = Number(e.target.value)
        videoRef.current.currentTime = t
        setPosition(t)
    }

    // Submit MCQ answer
    async function submitMcq() {
        if (selectedOption === null || !activeCheckpointId) return
        const cp = video.checkpoints.find(c => c.id === activeCheckpointId)
        if (!cp) return

        const passed = selectedOption === cp.correctOptionIndex
        await resolveCheckpoint(activeCheckpointId, passed, passed ? 'Correct.' : '')
    }

    // Submit written answer
    async function submitWritten() {
        if (!writtenAnswer.trim() || !activeCheckpointId || reviewing) return
        setReviewing(true)
        try {
            const result = await onWrittenReview(activeCheckpointId, writtenAnswer)
            await resolveCheckpoint(activeCheckpointId, result.passed, '')
        } finally {
            setReviewing(false)
        }
    }

    async function resolveCheckpoint(checkpointId: string, passed: boolean, feedbackText: string) {
        setFeedback({ passed, text: feedbackText })

        const prev = cpStates[checkpointId]
        const newAttempts = (prev?.attempts ?? 0) + 1
        const canSkip = !passed && newAttempts >= 3

        setCpStates(s => ({
            ...s,
            [checkpointId]: { checkpointId, passed, attempts: newAttempts, canSkip },
        }))

        await onProgressUpdate({ checkpointResult: { checkpointId, passed } }).catch(() => {})

        if (!passed && !canSkip) return  // wait for user to click "Rewatch Section"

        // Passed or can skip — allow continue after brief pause
        setTimeout(() => {
            setActiveCheckpointId(null)
            setFeedback(null)
            if (videoRef.current) {
                videoRef.current.play()
                setPlaying(true)
            }
        }, passed ? 2200 : 0)
    }

    function rewatch() {
        if (!videoRef.current || !activeCheckpointId) return
        const cp = video.checkpoints.find(c => c.id === activeCheckpointId)
        if (!cp) return
        setFadeOpaque(true)
        const v = videoRef.current
        setTimeout(() => {
            setActiveCheckpointId(null)
            setFeedback(null)
            setSelectedOption(null)
            setWrittenAnswer('')
            v.currentTime = cp.rewindToSeconds
            setTimeout(() => {
                setFadeOpaque(false)
                v.play()
                setPlaying(true)
            }, 80)
        }, 300)
    }

    function skipAfterThreeFails() {
        setActiveCheckpointId(null)
        setFeedback(null)
        if (videoRef.current) {
            videoRef.current.play()
            setPlaying(true)
        }
    }

    const activeCheckpoint = activeCheckpointId ? video.checkpoints.find(c => c.id === activeCheckpointId) : null
    const activeCpState    = activeCheckpointId ? cpStates[activeCheckpointId] : null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: '#000', border: `1px solid ${BORDER}`, position: 'relative' }}>
            <style>{`
                @keyframes rewatchPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0); border-color: rgba(255,255,255,0.1); }
                    50%       { box-shadow: 0 0 0 5px rgba(234,179,8,0.18); border-color: rgba(234,179,8,0.55); }
                }
            `}</style>

            {/* Video element */}
            <div style={{ position: 'relative' }}>
                <video
                    ref={videoRef}
                    src={video.url}
                    style={{ width: '100%', display: 'block', maxHeight: 480, background: '#000' }}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                        setPlaying(false)
                        onProgressUpdate({ completed: true, lastPositionSeconds: Math.floor(duration) }).catch(() => {})
                    }}
                />

                {/* Fade overlay for rewatch transition */}
                <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fadeOpaque ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none', zIndex: 9 }} />

                {/* Checkpoint overlay */}
                {activeCheckpoint && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 10 }}>
                        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <LockIcon sx={{ fontSize: 14, color: RED }} />
                                <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: RED }}>Checkpoint</span>
                            </div>

                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{activeCheckpoint.question}</div>

                            {!feedback ? (
                                <>
                                    {activeCheckpoint.type === 'mcq' && activeCheckpoint.options && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {activeCheckpoint.options.map((opt, i) => (
                                                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: selectedOption === i ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedOption === i ? RED + '60' : BORDER}`, cursor: 'pointer', fontSize: '0.8rem', color: TEXT, lineHeight: 1.4 }}>
                                                    <input type='radio' name='mcq' value={i} checked={selectedOption === i} onChange={() => setSelectedOption(i)} style={{ accentColor: RED, marginTop: 2, flexShrink: 0 }} />
                                                    {opt}
                                                </label>
                                            ))}
                                        </div>
                                    )}

                                    {activeCheckpoint.type === 'written' && (
                                        <textarea
                                            value={writtenAnswer}
                                            onChange={e => setWrittenAnswer(e.target.value)}
                                            placeholder='Type your answer here…'
                                            rows={4}
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: TEXT, padding: '10px 12px', fontSize: '0.82rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                        />
                                    )}

                                    <button
                                        onClick={activeCheckpoint.type === 'mcq' ? submitMcq : submitWritten}
                                        disabled={(activeCheckpoint.type === 'mcq' && selectedOption === null) || (activeCheckpoint.type === 'written' && !writtenAnswer.trim()) || reviewing}
                                        style={{ alignSelf: 'flex-start', padding: '9px 22px', background: RED, border: 'none', color: '#fff', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: ((activeCheckpoint.type === 'mcq' && selectedOption === null) || reviewing) ? 0.45 : 1 }}>
                                        {reviewing ? 'Reviewing…' : 'Submit Answer'}
                                    </button>
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: feedback.passed ? 'rgba(80,200,120,0.07)' : 'rgba(219,0,29,0.07)', border: `1px solid ${feedback.passed ? 'rgba(80,200,120,0.25)' : RED + '40'}` }}>
                                        {feedback.passed
                                            ? <CheckCircleIcon sx={{ fontSize: 18, color: 'rgba(80,200,120,0.9)', flexShrink: 0, mt: '1px' }} />
                                            : <WarningAmberIcon sx={{ fontSize: 18, color: RED, flexShrink: 0, mt: '1px' }} />
                                        }
                                        <div>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: feedback.passed ? 'rgba(80,200,120,0.9)' : RED, marginBottom: 4 }}>
                                                {feedback.passed ? 'Correct' : activeCpState?.canSkip ? 'Incorrect — 3 attempts reached' : 'Incorrect'}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.5 }}>{feedback.text}</div>
                                        </div>
                                    </div>

                                    {!feedback.passed && (
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            <button onClick={rewatch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: TEXT, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', animation: 'rewatchPulse 1.5s ease-in-out infinite' }}>
                                                <ReplayIcon sx={{ fontSize: 14 }} /> Rewatch Section
                                            </button>
                                            {activeCpState?.canSkip && (
                                                <button onClick={skipAfterThreeFails} style={{ padding: '8px 16px', background: 'rgba(219,0,29,0.12)', border: `1px solid ${RED}40`, color: RED, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    Continue (trainer follow-up pending)
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Attempt counter */}
                            {activeCpState && (
                                <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.08em' }}>
                                    Attempt {(activeCpState.attempts) + (feedback ? 0 : 1)} {activeCpState.canSkip ? '— J3 trainer has been notified' : ''}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Controls bar */}
            <div style={{ background: 'rgba(10,10,10,0.95)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: MUTED, flexShrink: 0 }}>{fmt(position)}</span>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input type='range' min={0} max={duration || 1} step={0.5} value={position}
                            onChange={handleSeek}
                            onMouseDown={() => setSeeking(true)}
                            onMouseUp={() => setSeeking(false)}
                            style={{ width: '100%', accentColor: RED, cursor: 'pointer', height: 3 }} />
                        {/* Checkpoint markers */}
                        {duration > 0 && sorted.map(cp => {
                            const state = cpStates[cp.id]
                            const left = (cp.timestampSeconds / duration) * 100
                            return (
                                <div key={cp.id} title={cp.question} style={{ position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', left: `${left}%`, width: 8, height: 8, borderRadius: '50%', background: state?.passed ? 'rgba(80,200,120,0.9)' : RED, border: '1px solid rgba(0,0,0,0.6)', pointerEvents: 'none', zIndex: 1 }} />
                            )
                        })}
                    </div>
                    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: MUTED, flexShrink: 0 }}>{fmt(duration)}</span>
                </div>

                {/* Play button + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={togglePlay} disabled={!!activeCheckpointId}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: activeCheckpointId ? 'rgba(255,255,255,0.04)' : RED, border: 'none', cursor: activeCheckpointId ? 'default' : 'pointer', color: '#fff', flexShrink: 0, opacity: activeCheckpointId ? 0.4 : 1 }}>
                        {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                    </button>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</span>
                    {activeCheckpointId && (
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: RED, flexShrink: 0 }}>
                            <LockIcon sx={{ fontSize: 10 }} /> Paused — checkpoint
                        </span>
                    )}
                </div>
            </div>

            {/* Checkpoint summary strip (trainer view) */}
            {isTrainer && video.checkpoints.length > 0 && (
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}`, background: DARK, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {sorted.map((cp, i) => {
                        const state = cpStates[cp.id]
                        return (
                            <div key={cp.id} title={`${cp.question} (${fmt(cp.timestampSeconds)})`}
                                style={{ fontSize: '0.55rem', padding: '3px 8px', border: `1px solid ${state?.passed ? 'rgba(80,200,120,0.3)' : BORDER}`, color: state?.passed ? 'rgba(80,200,120,0.8)' : MUTED, background: state?.passed ? 'rgba(80,200,120,0.06)' : 'transparent', letterSpacing: '0.06em' }}>
                                CP{i + 1} · {fmt(cp.timestampSeconds)} · {cp.type.toUpperCase()}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
