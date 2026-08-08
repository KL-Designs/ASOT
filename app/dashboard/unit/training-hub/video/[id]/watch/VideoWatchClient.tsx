'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ArrowBackIcon         from '@mui/icons-material/ArrowBack'
import PlayArrowIcon         from '@mui/icons-material/PlayArrow'
import PauseIcon             from '@mui/icons-material/Pause'
import VolumeUpIcon          from '@mui/icons-material/VolumeUp'
import VolumeOffIcon         from '@mui/icons-material/VolumeOff'
import ReplayIcon            from '@mui/icons-material/Replay'
import CheckCircleIcon       from '@mui/icons-material/CheckCircle'
import WarningAmberIcon      from '@mui/icons-material/WarningAmber'
import LockIcon              from '@mui/icons-material/Lock'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'

const RED    = '#db001d'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = 'rgba(237,237,237,0.88)'
const MUTED  = 'rgba(237,237,237,0.35)'

function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
}

function backLabel(from: string) {
    switch (from) {
        case 'courses': return 'Back to Courses'
        case 'videos':  return 'Back to Videos'
        case 'edit':    return 'Back to Editor'
        default:        return 'Back'
    }
}

function getSectionEnd(idx: number, sorted: TrainingVideoSection[], duration: number): number {
    if (sorted[idx].endSeconds !== undefined) return sorted[idx].endSeconds!
    if (idx + 1 < sorted.length) return sorted[idx + 1].startSeconds
    return duration
}

interface CheckpointState {
    checkpointId: string
    passed: boolean
    attempts: number
    canSkip: boolean
}

interface Props {
    video: TrainingTypeVideo & { _id: string }
    initialProgress: TrainingVideoProgress | null
    from: string
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoWatchClient({ video, initialProgress, from }: Props) {
    const router    = useRouter()
    const videoRef  = useRef<HTMLVideoElement>(null)
    const saveTimer = useRef<NodeJS.Timeout | null>(null)

    const [playing,    setPlaying]    = useState(false)
    const [duration,   setDuration]   = useState(0)
    const [position,   setPosition]   = useState(0)
    const [muted,      setMuted]      = useState(false)
    const [volume,     setVolume]     = useState(1)
    const [speed,      setSpeed]      = useState(1)
    const [fadeOpaque, setFadeOpaque] = useState(false)

    const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null)
    const [selectedOption,     setSelectedOption]      = useState<number | null>(null)
    const [writtenAnswer,      setWrittenAnswer]       = useState('')
    const [reviewing,          setReviewing]           = useState(false)
    const [feedback,           setFeedback]            = useState<{ passed: boolean; text: string } | null>(null)

    const [cpStates, setCpStates] = useState<Record<string, CheckpointState>>(() => {
        const map: Record<string, CheckpointState> = {}
        for (const cp of video.checkpoints) {
            const prog = initialProgress?.checkpoints.find(c => c.checkpointId === cp.id)
            map[cp.id] = {
                checkpointId: cp.id,
                passed:   prog?.passed   ?? false,
                attempts: prog?.attempts ?? 0,
                canSkip:  (prog?.attempts ?? 0) >= 3,
            }
        }
        return map
    })

    const sorted         = [...video.checkpoints].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    const sortedSections = video.sections ? [...video.sections].sort((a, b) => a.startSeconds - b.startSeconds) : []

    // Restore saved position
    useEffect(() => {
        if (!videoRef.current) return
        const saved = initialProgress?.lastPositionSeconds ?? 0
        if (saved > 5) videoRef.current.currentTime = saved
    }, [initialProgress?.lastPositionSeconds])

    // Apply speed
    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = speed
    }, [speed])

    // Apply mute
    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = muted
    }, [muted])

    // Apply volume
    useEffect(() => {
        if (videoRef.current) videoRef.current.volume = volume
    }, [volume])

    const savePosition = useCallback(() => {
        if (!videoRef.current) return
        fetch(`/api/training-videos/${video._id}/progress`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastPositionSeconds: Math.floor(videoRef.current.currentTime) }),
        }).catch(() => {})
    }, [video._id])

    useEffect(() => {
        if (playing) {
            saveTimer.current = setInterval(savePosition, 5000)
        } else {
            if (saveTimer.current) clearInterval(saveTimer.current)
        }
        return () => { if (saveTimer.current) clearInterval(saveTimer.current) }
    }, [playing, savePosition])

    const currentSectionIdx = sortedSections.findIndex((sec, i) => {
        const end = getSectionEnd(i, sortedSections, duration)
        return position >= sec.startSeconds && position < end
    })

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

    function seekTo(t: number) {
        if (!videoRef.current) return
        videoRef.current.currentTime = t
        setPosition(t)
        if (!playing && !activeCheckpointId) {
            videoRef.current.play()
            setPlaying(true)
        }
    }

    async function submitMcq() {
        if (selectedOption === null || !activeCheckpointId) return
        const cp = video.checkpoints.find(c => c.id === activeCheckpointId)
        if (!cp) return
        const passed = selectedOption === cp.correctOptionIndex
        await resolveCheckpoint(activeCheckpointId, passed, passed ? 'Correct.' : '')
    }

    async function submitWritten() {
        if (!writtenAnswer.trim() || !activeCheckpointId || reviewing) return
        setReviewing(true)
        try {
            const res = await fetch(`/api/training-videos/${video._id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkpointId: activeCheckpointId, answer: writtenAnswer }),
            })
            const result = await res.json()
            await resolveCheckpoint(activeCheckpointId, result.passed, '')
        } finally {
            setReviewing(false)
        }
    }

    async function resolveCheckpoint(checkpointId: string, passed: boolean, feedbackText: string) {
        setFeedback({ passed, text: feedbackText })

        const prev       = cpStates[checkpointId]
        const newAttempts = (prev?.attempts ?? 0) + 1
        const canSkip    = !passed && newAttempts >= 3

        setCpStates(s => ({ ...s, [checkpointId]: { checkpointId, passed, attempts: newAttempts, canSkip } }))

        await fetch(`/api/training-videos/${video._id}/progress`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkpointResult: { checkpointId, passed } }),
        }).catch(() => {})

        if (!passed && !canSkip) return

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
        <div style={{ display: 'flex', flexDirection: 'column', background: '#0a0a0a', color: TEXT, minHeight: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(12,12,12,0.98)', flexShrink: 0 }}>
                <button onClick={() => router.back()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: MUTED, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', padding: '3px 0' }}>
                    <ArrowBackIcon sx={{ fontSize: 13 }} /> {backLabel(from)}
                </button>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: TEXT }}>{video.title}</div>
            </div>

            {/* Body — two-column */}
            <style>{`
            @keyframes rewatchPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0); border-color: rgba(255,255,255,0.08); }
                50%       { box-shadow: 0 0 0 5px rgba(234,179,8,0.18); border-color: rgba(234,179,8,0.55); }
            }
        `}</style>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                {/* Left — video + controls */}
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', background: '#000' }}>
                    <div style={{ position: 'relative', background: '#000' }}>
                        <video
                            ref={videoRef}
                            src={video.url}
                            style={{ width: '100%', display: 'block' }}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onEnded={() => {
                                setPlaying(false)
                                fetch(`/api/training-videos/${video._id}/progress`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ completed: true, lastPositionSeconds: Math.floor(duration) }),
                                }).catch(() => {})
                            }}
                        />
                        <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fadeOpaque ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none', zIndex: 10 }} />
                    </div>

                    {/* Controls */}
                    <div style={{ background: 'rgba(5,5,5,0.98)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${BORDER}` }}>
                        {/* Seek bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: MUTED, flexShrink: 0, minWidth: 36 }}>{fmt(position)}</span>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input type='range' min={0} max={duration || 1} step={0.5} value={position} onChange={handleSeek}
                                    style={{ width: '100%', accentColor: RED, cursor: 'pointer', height: 3 }} />
                                {duration > 0 && sorted.map(cp => {
                                    const state = cpStates[cp.id]
                                    const left  = (cp.timestampSeconds / duration) * 100
                                    return (
                                        <div key={cp.id} title={cp.question}
                                            style={{ position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', left: `${left}%`, width: 7, height: 7, borderRadius: '50%', background: state?.passed ? 'rgba(80,200,120,0.9)' : RED, border: '1px solid rgba(0,0,0,0.6)', pointerEvents: 'none', zIndex: 1 }} />
                                    )
                                })}
                            </div>
                            <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: MUTED, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{fmt(duration)}</span>
                        </div>

                        {/* Playback row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={togglePlay} disabled={!!activeCheckpointId}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: activeCheckpointId ? 'rgba(255,255,255,0.04)' : RED, border: 'none', cursor: activeCheckpointId ? 'default' : 'pointer', color: '#fff', flexShrink: 0, opacity: activeCheckpointId ? 0.4 : 1 }}>
                                {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                            </button>

                            <div style={{ display: 'flex', gap: 3 }}>
                                {SPEEDS.map(s => (
                                    <button key={s} onClick={() => setSpeed(s)}
                                        style={{ padding: '3px 6px', background: speed === s ? 'rgba(219,0,29,0.15)' : 'transparent', border: `1px solid ${speed === s ? RED + '50' : BORDER}`, color: speed === s ? RED : MUTED, fontSize: '0.52rem', fontWeight: 700, cursor: 'pointer' }}>
                                        {s}x
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                <button onClick={() => setMuted(m => !m)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px', background: 'transparent', border: `1px solid ${BORDER}`, borderRight: 'none', color: muted ? RED : MUTED, cursor: 'pointer' }}>
                                    {muted ? <VolumeOffIcon sx={{ fontSize: 16 }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', border: `1px solid ${BORDER}`, height: 28 }}>
                                    <input
                                        type='range' min={0} max={1} step={0.05}
                                        value={volume}
                                        onChange={e => {
                                            const v = Number(e.target.value)
                                            setVolume(v)
                                            if (muted) setMuted(false)
                                        }}
                                        style={{ width: 72, accentColor: RED, cursor: 'pointer', height: 3, opacity: muted ? 0.35 : 1 }}
                                    />
                                </div>
                            </div>

                            {activeCheckpointId && (
                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED }}>
                                    <LockIcon sx={{ fontSize: 10 }} /> Checkpoint — answer required
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right — sidebar */}
                <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', background: 'rgba(8,8,8,0.98)' }}>

                    {/* Sections */}
                    {sortedSections.length > 0 && (
                        <div style={{ borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                            <div style={{ padding: '10px 14px 6px', fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>
                                Sections
                            </div>
                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {sortedSections.map((sec, i) => {
                                    const isActive = i === currentSectionIdx
                                    return (
                                        <button key={sec.id} onClick={() => seekTo(sec.startSeconds)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 14px', background: isActive ? 'rgba(219,0,29,0.05)' : 'transparent', border: 'none', borderLeft: `3px solid ${isActive ? RED : 'transparent'}`, cursor: 'pointer', textAlign: 'left', color: isActive ? TEXT : MUTED }}>
                                            <PlayCircleOutlineIcon sx={{ fontSize: 13, flexShrink: 0, color: isActive ? RED : MUTED }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.title}</div>
                                                <div style={{ fontSize: '0.55rem', color: MUTED, marginTop: 1 }}>{fmt(sec.startSeconds)}</div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Checkpoint panel */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                        {!activeCheckpoint ? (
                            video.checkpoints.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
                                        Checkpoints
                                    </div>
                                    {sorted.map((cp, i) => {
                                        const state = cpStates[cp.id]
                                        return (
                                            <div key={cp.id}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: state?.passed ? 'rgba(80,200,120,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${state?.passed ? 'rgba(80,200,120,0.18)' : BORDER}` }}>
                                                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: state?.passed ? 'rgba(80,200,120,0.75)' : MUTED, flexShrink: 0 }}>CP{i + 1}</div>
                                                <div style={{ flex: 1, fontSize: '0.62rem', color: state?.passed ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cp.question}</div>
                                                {state?.passed && <CheckCircleIcon sx={{ fontSize: 13, color: 'rgba(80,200,120,0.75)', flexShrink: 0 }} />}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, opacity: 0.25 }}>
                                    <PlayArrowIcon sx={{ fontSize: 26 }} />
                                    <div style={{ fontSize: '0.6rem', letterSpacing: '0.08em' }}>No checkpoints</div>
                                </div>
                            )
                        ) : (
                            /* Active checkpoint Q&A */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <LockIcon sx={{ fontSize: 12, color: RED }} />
                                    <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: RED }}>Checkpoint</span>
                                </div>

                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: TEXT, lineHeight: 1.45 }}>
                                    {activeCheckpoint.question}
                                </div>

                                {!feedback ? (
                                    <>
                                        {activeCheckpoint.type === 'mcq' && activeCheckpoint.options && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {activeCheckpoint.options.map((opt, i) => (
                                                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: selectedOption === i ? 'rgba(219,0,29,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedOption === i ? RED + '55' : BORDER}`, cursor: 'pointer', fontSize: '0.74rem', color: TEXT, lineHeight: 1.4 }}>
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
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, color: TEXT, padding: '8px 10px', fontSize: '0.78rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                            />
                                        )}

                                        <button
                                            onClick={activeCheckpoint.type === 'mcq' ? submitMcq : submitWritten}
                                            disabled={(activeCheckpoint.type === 'mcq' && selectedOption === null) || (activeCheckpoint.type === 'written' && !writtenAnswer.trim()) || reviewing}
                                            style={{ alignSelf: 'flex-start', padding: '8px 18px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: ((activeCheckpoint.type === 'mcq' && selectedOption === null) || reviewing) ? 0.45 : 1 }}>
                                            {reviewing ? 'Reviewing…' : 'Submit Answer'}
                                        </button>

                                        {activeCpState && (
                                            <div style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>
                                                Attempt {activeCpState.attempts + (feedback ? 0 : 1)}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', background: feedback.passed ? 'rgba(80,200,120,0.06)' : 'rgba(219,0,29,0.06)', border: `1px solid ${feedback.passed ? 'rgba(80,200,120,0.2)' : RED + '40'}` }}>
                                            {feedback.passed
                                                ? <CheckCircleIcon sx={{ fontSize: 15, color: 'rgba(80,200,120,0.9)', flexShrink: 0, marginTop: '1px' }} />
                                                : <WarningAmberIcon sx={{ fontSize: 15, color: RED, flexShrink: 0, marginTop: '1px' }} />
                                            }
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: feedback.passed ? 'rgba(80,200,120,0.9)' : RED, marginBottom: 4 }}>
                                                    {feedback.passed ? 'Correct' : activeCpState?.canSkip ? 'Incorrect — 3 attempts reached' : 'Incorrect'}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: MUTED, lineHeight: 1.5 }}>{feedback.text}</div>
                                            </div>
                                        </div>

                                        {!feedback.passed && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <button onClick={rewatch}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: TEXT, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', animation: 'rewatchPulse 1.5s ease-in-out infinite' }}>
                                                    <ReplayIcon sx={{ fontSize: 13 }} /> Rewatch Section
                                                </button>
                                                {activeCpState?.canSkip && (
                                                    <button onClick={skipAfterThreeFails}
                                                        style={{ padding: '7px 14px', background: 'rgba(219,0,29,0.1)', border: `1px solid ${RED}40`, color: RED, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                        Continue (trainer follow-up pending)
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
