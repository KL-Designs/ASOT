'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QuizSectionSidebar from '@/components/quiz/QuizSectionSidebar'
import QuizQuestionCard from '@/components/quiz/QuizQuestionCard'
import QuizTimerPanel from '@/components/quiz/QuizTimerPanel'
import QuizInstructionModal from '@/components/quiz/QuizInstructionModal'

const RED = '#db001d'

interface Props {
    quiz: QuizDefinition
    initialAttempt: QuizAttemptSerialized
}

interface ConfirmDialog {
    type: 'submit' | 'unanswered'
    unansweredCount?: number
}

export default function QuizClient({ quiz, initialAttempt }: Props) {
    const attemptId = initialAttempt._id

    // Quiz state
    const [started, setStarted] = useState(initialAttempt.status === 'in_progress')
    const [startedAt, setStartedAt] = useState<string | null>(initialAttempt.startedAt ?? null)
    const [starting, setStarting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)

    // Active section tracking via IntersectionObserver
    const [activeSectionId, setActiveSectionId] = useState<string | null>(quiz.sections[0]?.id ?? null)

    // Answers: questionId → value
    const [answers, setAnswers] = useState<Record<string, string | null>>(() => {
        const map: Record<string, string | null> = {}
        for (const section of quiz.sections) {
            for (const q of section.questions) {
                map[q.id] = null
            }
        }
        for (const a of initialAttempt.answers) {
            map[a.questionId] = a.value
        }
        return map
    })

    const totalSeconds = initialAttempt.timeLimitMinutes * 60

    // Debounced auto-save
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const saveAnswers = useCallback(async (current: Record<string, string | null>) => {
        const payload: QuizAnswer[] = Object.entries(current).map(([questionId, value]) => ({
            questionId,
            value: value ?? null,
            answeredAt: new Date().toISOString(),
        }))
        await fetch(`/api/community/quiz/${attemptId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', answers: payload }),
        }).catch(() => { /* silently fail saves */ })
    }, [attemptId])

    function handleAnswer(questionId: string, value: string) {
        setAnswers(prev => {
            const next = { ...prev, [questionId]: value }
            if (saveTimer.current) clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(() => saveAnswers(next), 2000)
            return next
        })
    }

    // IntersectionObserver to track active section
    useEffect(() => {
        const observers: IntersectionObserver[] = []
        for (const section of quiz.sections) {
            const el = document.getElementById(`section-${section.id}`)
            if (!el) continue
            const obs = new IntersectionObserver(
                ([entry]) => { if (entry.isIntersecting) setActiveSectionId(section.id) },
                { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
            )
            obs.observe(el)
            observers.push(obs)
        }
        return () => observers.forEach(o => o.disconnect())
    }, [quiz.sections])

    async function handleStart() {
        setStarting(true)
        try {
            const res = await fetch(`/api/community/quiz/${attemptId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' }),
            })
            if (res.ok) {
                const now = new Date().toISOString()
                setStartedAt(now)
                setStarted(true)
            }
        } finally {
            setStarting(false)
        }
    }

    function handleSubmitRequest() {
        const unanswered = Object.values(answers).filter(v => !v || v.trim() === '').length
        if (unanswered > 0) {
            setConfirmDialog({ type: 'unanswered', unansweredCount: unanswered })
        } else {
            setConfirmDialog({ type: 'submit' })
        }
    }

    async function handleSubmitConfirm() {
        setConfirmDialog(null)
        setSubmitting(true)
        try {
            const payload: QuizAnswer[] = Object.entries(answers).map(([questionId, value]) => ({
                questionId, value: value ?? null,
                answeredAt: new Date().toISOString(),
            }))
            const res = await fetch(`/api/community/quiz/${attemptId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit', answers: payload }),
            })
            if (res.ok) setSubmitted(true)
        } finally {
            setSubmitting(false)
        }
    }

    function handleExpired() {
        // Auto-submit on timer expiry
        handleSubmitConfirm()
    }

    function scrollToSection(sectionId: string) {
        const el = document.getElementById(`section-${sectionId}`)
        if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 80
            window.scrollTo({ top, behavior: 'smooth' })
        }
    }

    const sidebarSections = quiz.sections.map(s => ({
        id: s.id,
        title: s.title,
        questions: s.questions.map(q => ({ id: q.id })),
    }))

    return (
        <>
            {/* Instruction modal */}
            {!started && (
                <QuizInstructionModal
                    title={quiz.title}
                    instructions={quiz.instructions}
                    timeLimitMinutes={initialAttempt.timeLimitMinutes}
                    onStart={handleStart}
                    starting={starting}
                />
            )}

            {/* Confirm / unanswered dialog */}
            {confirmDialog && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                }}>
                    <div style={{
                        maxWidth: 420, width: '100%',
                        border: `1px solid rgba(219,0,29,0.35)`,
                        borderTop: `2px solid ${RED}`,
                        background: 'rgba(10,10,10,0.97)',
                        padding: '28px 24px',
                    }}>
                        <div style={{
                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em',
                            textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)',
                            fontFamily: 'monospace', marginBottom: 12,
                        }}>
                            {'// CONFIRM SUBMISSION'}
                        </div>
                        {confirmDialog.type === 'unanswered' ? (
                            <>
                                <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.88)', lineHeight: 1.6, margin: '0 0 8px' }}>
                                    You have <strong style={{ color: RED }}>{confirmDialog.unansweredCount}</strong> unanswered {confirmDialog.unansweredCount === 1 ? 'question' : 'questions'}.
                                </p>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.5, margin: '0 0 20px' }}>
                                    We encourage you to attempt all questions — even a guess is better than leaving it blank. Are you sure you want to submit now?
                                </p>
                            </>
                        ) : (
                            <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.88)', lineHeight: 1.6, margin: '0 0 20px' }}>
                                Are you sure you want to submit your quiz? You will not be able to make changes after submission.
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setConfirmDialog(null)}
                                style={{
                                    all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                                    padding: '9px 0', border: '1px solid rgba(255,255,255,0.15)',
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                                    textTransform: 'uppercase', color: 'rgba(237,237,237,0.65)',
                                    background: 'transparent',
                                }}
                            >
                                Go Back
                            </button>
                            <button
                                onClick={handleSubmitConfirm}
                                style={{
                                    all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                                    padding: '9px 0', border: `1px solid ${RED}`,
                                    background: RED,
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                                    textTransform: 'uppercase', color: '#fff',
                                }}
                            >
                                Submit Quiz
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                padding: '10px 24px',
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em',
                        color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace', textTransform: 'uppercase',
                    }}>
                        J3 // TRAINING
                    </span>
                    <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)',
                    }}>
                        {quiz.title}
                    </span>
                </div>
            </div>

            {/* Three-column layout */}
            <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start' }}>

                {/* Left: section sidebar */}
                <QuizSectionSidebar
                    sections={sidebarSections}
                    answers={answers}
                    activeSectionId={activeSectionId}
                    onScrollTo={scrollToSection}
                />

                {/* Centre: questions */}
                <div style={{ flex: 1, minWidth: 0, padding: '24px 20px 80px' }}>
                    {submitted ? (
                        <div style={{
                            padding: '48px 24px', textAlign: 'center',
                            border: '1px solid rgba(34,197,94,0.3)',
                            borderTop: '2px solid rgba(34,197,94,0.8)',
                            background: 'rgba(0,0,0,0.2)',
                        }}>
                            <div style={{
                                fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.08em',
                                textTransform: 'uppercase', fontFamily: 'monospace',
                                color: 'rgba(34,197,94,0.85)', marginBottom: 16,
                                textAlign: 'center',
                            }}>
                                ✓ Submitted
                            </div>
                            <p style={{ fontSize: '0.88rem', color: 'rgba(237,237,237,0.8)', lineHeight: 1.7, margin: '0 auto', maxWidth: 440, textAlign: 'center' }}>
                                Your quiz has been submitted successfully.
                            </p>
                            <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6, margin: '10px auto 0', maxWidth: 440, textAlign: 'center' }}>
                                Your J3 trainer will be in touch with you shortly.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                            {(() => {
                                // Compute global question offset for each section
                                let globalOffset = 0
                                return quiz.sections.map((section, si) => {
                                    const offset = globalOffset
                                    globalOffset += section.questions.length
                                    return (
                                        <div key={section.id} id={`section-${section.id}`}>
                                            {/* Section header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                marginBottom: 12, paddingBottom: 8,
                                                borderBottom: `1px solid rgba(219,0,29,0.2)`,
                                            }}>
                                                <span style={{
                                                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em',
                                                    color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace',
                                                }}>
                                                    {String(si + 1).padStart(2, '0')}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.22em',
                                                    textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)',
                                                }}>
                                                    {section.title}
                                                </span>
                                            </div>
                                            {/* Questions */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {section.questions.map((q, qi) => (
                                                    <QuizQuestionCard
                                                        key={q.id}
                                                        questionIndex={offset + qi}
                                                        question={q}
                                                        value={answers[q.id] ?? null}
                                                        onChange={(v) => handleAnswer(q.id, v)}
                                                        readOnly={submitted || submitting}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })
                            })()}

                            {/* Bottom submit — green */}
                            <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <button
                                    onClick={handleSubmitRequest}
                                    disabled={submitting}
                                    style={{
                                        all: 'unset', cursor: submitting ? 'default' : 'pointer',
                                        display: 'block', width: '100%', boxSizing: 'border-box',
                                        textAlign: 'center', padding: '12px 0',
                                        background: submitting ? 'rgba(22,163,74,0.4)' : '#16a34a',
                                        border: '1px solid #16a34a',
                                        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.15em',
                                        textTransform: 'uppercase', color: '#fff',
                                        opacity: submitting ? 0.7 : 1,
                                    }}
                                >
                                    {submitting ? 'Submitting…' : 'Submit Quiz'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: timer panel */}
                {started && startedAt && (
                    <QuizTimerPanel
                        totalSeconds={totalSeconds}
                        startedAt={startedAt}
                        onExpired={handleExpired}
                        onSubmit={handleSubmitRequest}
                        submitting={submitting}
                        submitted={submitted}
                    />
                )}
            </div>
        </>
    )
}
