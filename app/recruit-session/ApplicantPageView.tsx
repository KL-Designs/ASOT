'use client'

import { useState, useEffect, useRef } from 'react'
import { StepContent, SECTION_MAP, RULES_QUESTIONS, type IntroProgress, type LivePreview } from './StepContent'

export const STEP_LABELS = [
    'Interview Setup', 'Introduction', 'Steam', 'Identity',
    'Background', 'Availability', 'Roles',
    'Basic Combat Trainings', 'BCT Availability', 'ORBAT Overview',
    'Rules & Expectations', 'Joining Agreement', 'Join Decision', 'Admin',
]

interface ApplicantPageViewProps {
    step: number
    raisedHand: boolean
    connected?: boolean
    recruiterOnline?: boolean
    recruiterName: string
    introProgress: IntroProgress
    livePreview?: LivePreview
    staticMode?: boolean
    onToggleHand?: () => void
    onRulesAnswer?: (questionIndex: number, answer: boolean) => void
    rulesAnswers?: Record<number, boolean | null>
    tsLinkWidget?: React.ReactNode
}

export default function ApplicantPageView({
    step,
    raisedHand,
    connected = true,
    recruiterOnline = true,
    recruiterName,
    introProgress,
    livePreview = {},
    staticMode = false,
    onToggleHand,
    onRulesAnswer,
    rulesAnswers = {},
    tsLinkWidget,
}: ApplicantPageViewProps) {
    const [animating, setAnimating] = useState(false)
    const prevStepRef = useRef(step)

    useEffect(() => {
        if (prevStepRef.current !== step) {
            setAnimating(true)
            const t = setTimeout(() => setAnimating(false), 350)
            prevStepRef.current = step
            return () => clearTimeout(t)
        }
    }, [step])

    const stepLabel = STEP_LABELS[step - 1] ?? 'Recruitment'
    const section = SECTION_MAP[step] ?? null
    const qi = livePreview.rulesQuestionIndex ?? 0
    const currentAnswer = rulesAnswers[qi]

    return (
        <div style={{ minHeight: staticMode ? '100%' : '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>

            {/* Top bar */}
            <div style={{ borderBottom: '1px solid rgba(219,0,29,0.2)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace' }}>// ASOT RECRUITMENT</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>with {recruiterName}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#00c364' : '#f59e0b', boxShadow: connected ? '0 0 6px rgba(0,195,100,0.5)' : 'none' }} />
                        {connected ? 'Connected' : 'Reconnecting…'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: recruiterOnline ? '#00c364' : 'rgba(255,255,255,0.15)' }} />
                        Recruiter {recruiterOnline ? 'online' : 'offline'}
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 120px' }}>
                <div style={{ textAlign: 'center', marginBottom: 36 }}>

                    {/* Section heading — intentionally large to establish hierarchy */}
                    {section && (
                        <div style={{ marginBottom: 10, opacity: animating ? 0 : 1, transition: 'opacity 0.25s ease' }}>
                            <div style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.85)', fontFamily: 'monospace', lineHeight: 1 }}>
                                SECTION {section.num}
                            </div>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginTop: 6 }}>
                                {section.title}
                            </div>
                        </div>
                    )}

                    {/* Step sub-label */}
                    <div style={{ fontSize: section ? '1.3rem' : '2rem', fontWeight: section ? 700 : 800, letterSpacing: section ? '0.06em' : '0.04em', textTransform: 'uppercase', color: section ? 'rgba(237,237,237,0.7)' : 'rgba(237,237,237,0.9)', opacity: animating ? 0 : 1, transform: animating ? 'translateY(8px)' : 'translateY(0)', transition: 'opacity 0.25s ease, transform 0.25s ease' }}>
                        {stepLabel}
                    </div>

                    {/* Progress dots */}
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 14 }}>
                        {STEP_LABELS.map((_, i) => (
                            <div key={i} style={{ width: i + 1 === step ? 18 : 6, height: 6, borderRadius: 3, background: i + 1 < step ? '#00c364' : i + 1 === step ? 'var(--red, #db001d)' : 'rgba(255,255,255,0.1)', transition: 'all 0.25s ease' }} />
                        ))}
                    </div>
                </div>

                {/* TS Link widget — above content card for step 14, so it's the first action */}
                {step === 14 && !staticMode && tsLinkWidget && (
                    <div style={{ width: '100%', maxWidth: 640, marginBottom: 16 }}>
                        {tsLinkWidget}
                    </div>
                )}

                {/* Content card */}
                <div style={{ width: '100%', maxWidth: 640, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid rgba(219,0,29,0.4)', padding: '28px 32px', opacity: animating ? 0 : 1, transform: animating ? 'translateY(12px)' : 'translateY(0)', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                    <StepContent step={step} introProgress={introProgress} livePreview={livePreview} />
                </div>

                {/* YES/NO for joining agreement — inline, always visible with the question */}
                {step === 12 && !staticMode && (
                    <div style={{ width: '100%', maxWidth: 640, marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button
                            onClick={onRulesAnswer ? () => onRulesAnswer(qi, true) : undefined}
                            style={{ flex: 1, maxWidth: 180, padding: '14px 20px', fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', background: currentAnswer === true ? 'rgba(0,195,100,0.2)' : 'rgba(0,195,100,0.06)', border: currentAnswer === true ? '2px solid #00c364' : '1px solid rgba(0,195,100,0.3)', color: currentAnswer === true ? '#00c364' : 'rgba(237,237,237,0.6)', cursor: 'pointer', transition: 'all 0.12s' }}
                        >YES</button>
                        <button
                            onClick={onRulesAnswer ? () => onRulesAnswer(qi, false) : undefined}
                            style={{ flex: 1, maxWidth: 180, padding: '14px 20px', fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', background: currentAnswer === false ? 'rgba(219,0,29,0.2)' : 'rgba(219,0,29,0.06)', border: currentAnswer === false ? '2px solid #ef4444' : '1px solid rgba(219,0,29,0.3)', color: currentAnswer === false ? '#ef4444' : 'rgba(237,237,237,0.6)', cursor: 'pointer', transition: 'all 0.12s' }}
                        >NO</button>
                    </div>
                )}

                {!connected && !staticMode && (
                    <div style={{ marginTop: 20, fontSize: '0.75rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
                        Reconnecting to session…
                    </div>
                )}
            </div>

            {/* Bottom bar — Raise Hand — fixed above footer, always visible */}
            <div style={staticMode
                ? { padding: '16px 24px', background: 'rgba(10,10,10,0.95)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }
                : { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, padding: '16px 24px', background: 'rgba(10,10,10,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', backdropFilter: 'blur(8px)' }
            }>

                {/* Raise hand */}
                {raisedHand && (
                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, letterSpacing: '0.06em' }}>
                        ✋ Your recruiter has been notified
                    </div>
                )}
                <button
                    onClick={staticMode ? undefined : onToggleHand}
                    style={{ padding: '10px 24px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: raisedHand ? 'rgba(245,158,11,0.2)' : 'rgba(219,0,29,0.1)', border: raisedHand ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(219,0,29,0.3)', color: raisedHand ? '#f59e0b' : 'rgba(237,237,237,0.6)', cursor: staticMode ? 'default' : 'pointer', transition: 'all 0.15s' }}
                >
                    {raisedHand ? '✋ Lower Hand' : '✋ Raise Hand'}
                </button>
            </div>

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
    )
}
