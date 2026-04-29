'use client'

import { useEffect, useRef, useState } from 'react'

const RED   = '#db001d'
const GREEN = '#16a34a'

interface Props {
    totalSeconds: number
    startedAt: string
    onExpired: () => void
    onSubmit: () => void
    submitting: boolean
    submitted: boolean
}

function playTone(frequency: number, durationMs: number) {
    try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
        osc.start()
        osc.stop(ctx.currentTime + durationMs / 1000)
    } catch { /* AudioContext not available */ }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function QuizTimerPanel({ totalSeconds, startedAt, onExpired, onSubmit, submitting, submitted }: Props) {
    const [timeLeft, setTimeLeft] = useState<number>(() => {
        const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
        return Math.max(0, totalSeconds - elapsed)
    })

    const alertedHalf     = useRef(false)
    const alertedOneMin   = useRef(false)
    const alertedThirtySec = useRef(false)
    const expiredCalled   = useRef(false)

    const [showHalfWarning,   setShowHalfWarning]   = useState(false)
    const [showOneMinWarning, setShowOneMinWarning] = useState(false)

    // Flash state for warnings
    const [halfFlash,   setHalfFlash]   = useState(false)
    const [oneMinFlash, setOneMinFlash] = useState(false)

    useEffect(() => {
        if (submitted) return

        const interval = setInterval(() => {
            const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
            const remaining = Math.max(0, totalSeconds - elapsed)
            setTimeLeft(remaining)

            const halfPoint = Math.round(totalSeconds / 2)

            if (!alertedHalf.current && remaining <= halfPoint) {
                alertedHalf.current = true
                playTone(660, 400)
                setShowHalfWarning(true)
                setHalfFlash(true)
                setTimeout(() => setShowHalfWarning(false), 12000)
                setTimeout(() => setHalfFlash(false), 12000)
            }

            if (!alertedOneMin.current && remaining <= 60 && remaining > 30) {
                alertedOneMin.current = true
                playTone(880, 300)
                setTimeout(() => playTone(880, 300), 350)
                setShowOneMinWarning(true)
                setOneMinFlash(true)
                setTimeout(() => setShowOneMinWarning(false), 12000)
                setTimeout(() => setOneMinFlash(false), 12000)
            }

            if (!alertedThirtySec.current && remaining <= 30) {
                alertedThirtySec.current = true
                playTone(1100, 200)
                setTimeout(() => playTone(1100, 200), 250)
                setTimeout(() => playTone(1100, 200), 500)
            }

            if (remaining === 0 && !expiredCalled.current) {
                expiredCalled.current = true
                clearInterval(interval)
                onExpired()
            }
        }, 500)

        return () => clearInterval(interval)
    }, [startedAt, totalSeconds, onExpired, submitted])

    const isRed     = timeLeft <= 30 && !submitted
    const isWarning = timeLeft <= 60 && !submitted
    const pct       = Math.max(0, timeLeft / totalSeconds)

    return (
        <div style={{
            width: 200,
            flexShrink: 0,
            position: 'sticky',
            top: 80,
            alignSelf: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            borderLeft: '1px solid rgba(255,255,255,0.07)',
        }}>
            {/* Keyframe styles */}
            <style>{`
                @keyframes quizRedPulse {
                    0%, 100% { background: rgba(219,0,29,0.08); }
                    50%       { background: rgba(219,0,29,0.22); }
                }
                @keyframes quizHalfFlash {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.35; }
                }
                @keyframes quizOneMinFlash {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.30; }
                }
            `}</style>

            {/* Timer block */}
            <div style={{
                padding: '20px 16px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: submitted
                    ? 'rgba(0,0,0,0.2)'
                    : isRed
                        ? 'rgba(219,0,29,0.08)'
                        : 'rgba(0,0,0,0.2)',
                animation: isRed && !submitted ? 'quizRedPulse 1s ease-in-out infinite' : 'none',
            }}>
                <div style={{
                    fontSize: '0.47rem', fontWeight: 700, letterSpacing: '0.25em',
                    textTransform: 'uppercase', fontFamily: 'monospace',
                    color: submitted ? 'rgba(237,237,237,0.25)' : isRed ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)',
                    marginBottom: 8,
                }}>
                    {submitted ? '// SUBMITTED' : '// TIME REMAINING'}
                </div>

                {submitted ? (
                    /* Larger centred Submitted display */
                    <div style={{ textAlign: 'center', paddingTop: 4 }}>
                        <div style={{
                            fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.06em',
                            fontFamily: 'monospace',
                            color: 'rgba(34,197,94,0.85)',
                            lineHeight: 1,
                            marginBottom: 6,
                        }}>
                            ✓ Submitted
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5 }}>
                            Your answers have been<br />sent for review.
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{
                            fontSize: '2rem', fontWeight: 800, letterSpacing: '0.06em',
                            fontFamily: 'monospace',
                            color: isRed ? RED : 'rgba(237,237,237,0.92)',
                            lineHeight: 1,
                        }}>
                            {formatTime(timeLeft)}
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginTop: 10, height: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${pct * 100}%`,
                                background: isRed ? RED : isWarning ? '#f59e0b' : 'rgba(219,0,29,0.6)',
                                transition: 'width 0.5s linear, background 0.3s',
                            }} />
                        </div>
                    </>
                )}
            </div>

            {/* Warning banners — stay 12 s, gentle flash */}
            {showHalfWarning && !submitted && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(245,158,11,0.12)',
                    borderBottom: '1px solid rgba(245,158,11,0.2)',
                    fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.4,
                    color: 'rgba(245,158,11,0.9)', letterSpacing: '0.04em',
                    animation: halfFlash ? 'quizHalfFlash 1.2s ease-in-out infinite' : 'none',
                }}>
                    Halfway through — keep going!
                </div>
            )}
            {showOneMinWarning && !submitted && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(239,68,68,0.1)',
                    borderBottom: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.4,
                    color: 'rgba(239,68,68,0.9)', letterSpacing: '0.04em',
                    animation: oneMinFlash ? 'quizOneMinFlash 0.9s ease-in-out infinite' : 'none',
                }}>
                    1 minute remaining!
                </div>
            )}

            {/* Submit button — green */}
            {!submitted && (
                <div style={{ padding: '14px 16px' }}>
                    <button
                        onClick={onSubmit}
                        disabled={submitting}
                        style={{
                            all: 'unset', cursor: submitting ? 'default' : 'pointer',
                            display: 'block', width: '100%', boxSizing: 'border-box',
                            textAlign: 'center', padding: '9px 0',
                            background: submitting ? 'rgba(22,163,74,0.4)' : GREEN,
                            border: `1px solid ${GREEN}`,
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: '#fff', opacity: submitting ? 0.7 : 1,
                            transition: 'all 0.15s',
                        }}
                    >
                        {submitting ? 'Submitting…' : 'Submit Quiz'}
                    </button>
                </div>
            )}

            {/* Guidance text */}
            {!submitted && (
                <div style={{
                    padding: '0 16px 16px',
                    fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', lineHeight: 1.5,
                }}>
                    Review all answers before submitting. You cannot change answers after submission.
                </div>
            )}
        </div>
    )
}
