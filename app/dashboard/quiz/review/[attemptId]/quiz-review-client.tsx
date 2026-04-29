'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QuizSectionSidebar from '@/components/quiz/QuizSectionSidebar'
import QuizQuestionCard from '@/components/quiz/QuizQuestionCard'

const RED    = '#db001d'
const GREEN  = '#16a34a'
const YELLOW = '#d97706'

interface Props {
    quiz: QuizDefinition
    attempt: QuizAttemptSerialized
    canEscalate: boolean
    isJ4: boolean
}

type ReviewDecision = 'pass' | 'fail' | 'send_for_review'

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

/** Auto-grade multiple-choice; return null for written/image (requires manual mark) */
function autoReviewState(question: QuizQuestion, answers: Record<string, string | null>): 'correct' | null {
    const value = answers[question.id]
    if (!value || value.trim() === '') return null
    if (question.type === 'multiple_choice' && question.correctOption !== undefined && question.options) {
        return value === question.options[question.correctOption] ? 'correct' : null
    }
    return null
}

export default function QuizReviewClient({ quiz, attempt, canEscalate, isJ4 }: Props) {
    const router = useRouter()
    const [activeSectionId, setActiveSectionId] = useState<string | null>(quiz.sections[0]?.id ?? null)
    const [decision, setDecision] = useState<ReviewDecision | null>(null)
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Per-question reviewer marks (written/image only)
    const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'correct' | 'incorrect'>>({})

    const isClosed = ['passed', 'failed'].includes(attempt.status)

    const answers: Record<string, string | null> = {}
    for (const section of quiz.sections) {
        for (const q of section.questions) answers[q.id] = null
    }
    for (const a of attempt.answers) answers[a.questionId] = a.value

    // All written/image questions that require manual marking
    const writtenQuestions = quiz.sections
        .flatMap(s => s.questions)
        .filter(q => q.type !== 'multiple_choice')

    // IntersectionObserver for active section
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

    function scrollToSection(sectionId: string) {
        const el = document.getElementById(`section-${sectionId}`)
        if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 80
            window.scrollTo({ top, behavior: 'smooth' })
        }
    }

    async function handleDecision() {
        if (!decision) return

        // Validate: all written questions must be marked before submitting
        if (decision !== 'send_for_review') {
            const unmarked = writtenQuestions.filter(q => !reviewDecisions[q.id])
            if (unmarked.length > 0) {
                setError(`Please mark all written questions as Correct or Incorrect before submitting. ${unmarked.length} question(s) still need to be marked.`)
                return
            }
        }

        if (decision === 'send_for_review' && !notes.trim()) {
            setError('Notes are required when sending for review.')
            return
        }

        setError(null)
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/quiz/review/${attempt._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: decision,
                    notes: notes.trim(),
                    questionDecisions: reviewDecisions,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Failed to submit decision.')
            } else {
                setSubmitted(true)
                setTimeout(() => router.push('/admin/j3'), 1500)
            }
        } finally {
            setSubmitting(false)
        }
    }

    const sidebarSections = quiz.sections.map(s => ({
        id: s.id,
        title: s.title,
        questions: s.questions.map(q => ({ id: q.id })),
    }))

    // Button style helper
    const decisionBtnSx = (active: boolean, variant: 'pass' | 'fail' | 'review') => ({
        all: 'unset' as const,
        cursor: 'pointer' as const,
        padding: '8px 14px',
        border: active
            ? variant === 'pass'   ? '1px solid rgba(34,197,94,0.7)'
            : variant === 'fail'   ? '1px solid rgba(239,68,68,0.7)'
            :                        '1px solid rgba(245,158,11,0.7)'
            : '1px solid rgba(255,255,255,0.12)',
        background: active
            ? variant === 'pass'   ? 'rgba(34,197,94,0.18)'
            : variant === 'fail'   ? 'rgba(239,68,68,0.18)'
            :                        'rgba(245,158,11,0.12)'
            : 'transparent',
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
        color: active
            ? variant === 'pass'   ? 'rgba(34,197,94,0.9)'
            : variant === 'fail'   ? 'rgba(239,68,68,0.9)'
            :                        'rgba(245,158,11,0.9)'
            : 'rgba(237,237,237,0.5)',
        transition: 'all 0.12s',
        flex: 1, textAlign: 'center' as const,
    })

    const ReviewActionPanel = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {!isClosed && !submitted && (
                <>
                    {/* Pass / Fail / Send for Review — J4 now also gets Send for Review */}
                    <div style={{
                        display: 'flex', gap: 6, padding: '14px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <button style={decisionBtnSx(decision === 'pass', 'pass')} onClick={() => setDecision('pass')}>Pass</button>
                        <button style={decisionBtnSx(decision === 'fail', 'fail')} onClick={() => setDecision('fail')}>Fail</button>
                        <button style={decisionBtnSx(decision === 'send_for_review', 'review')} onClick={() => setDecision('send_for_review')}>
                            Send for Review
                        </button>
                    </div>

                    {decision === 'send_for_review' && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace', marginBottom: 6 }}>
                                Notes (required)
                            </div>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Describe your concerns or reasons for escalation…"
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.72rem', lineHeight: 1.5,
                                    padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                        </div>
                    )}

                    {(decision === 'pass' || decision === 'fail') && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace', marginBottom: 6 }}>
                                Notes (optional)
                            </div>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Any notes for the record…"
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.72rem', lineHeight: 1.5,
                                    padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '8px 16px', fontSize: '0.65rem', color: 'rgba(239,68,68,0.9)', background: 'rgba(239,68,68,0.08)', lineHeight: 1.5 }}>
                            {error}
                        </div>
                    )}

                    {decision && (
                        <div style={{ padding: '12px 16px' }}>
                            <button
                                onClick={handleDecision}
                                disabled={submitting}
                                style={{
                                    all: 'unset', cursor: submitting ? 'default' : 'pointer',
                                    display: 'block', width: '100%', boxSizing: 'border-box',
                                    textAlign: 'center', padding: '9px 0',
                                    background: decision === 'pass'
                                        ? 'rgba(22,163,74,0.9)'
                                        : decision === 'fail'
                                            ? 'rgba(239,68,68,0.85)'
                                            : 'rgba(217,119,6,0.85)',
                                    border: '1px solid transparent',
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: '#fff', opacity: submitting ? 0.7 : 1,
                                }}
                            >
                                {submitting ? 'Submitting…'
                                    : decision === 'pass'            ? 'Confirm Pass'
                                    : decision === 'fail'            ? 'Confirm Fail'
                                    :                                   'Send for Review'}
                            </button>
                        </div>
                    )}
                </>
            )}

            {submitted && (
                <div style={{ padding: '16px', fontSize: '0.7rem', color: 'rgba(34,197,94,0.8)', textAlign: 'center' }}>
                    Decision submitted. Redirecting…
                </div>
            )}

            {isClosed && (
                <div style={{ padding: '14px 16px' }}>
                    <span style={{
                        display: 'block', textAlign: 'center', padding: '8px',
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: attempt.status === 'passed' ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
                        border: attempt.status === 'passed' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    }}>
                        {attempt.status === 'passed' ? 'Passed' : 'Failed'}
                    </span>
                </div>
            )}
        </div>
    )

    return (
        <>
            {/* Header */}
            <div style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.4)',
                padding: '10px 24px',
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                        J3 // TRAINING
                    </span>
                    <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)' }}>
                        Review — {quiz.title}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>
                        {attempt.userName}
                    </span>
                </div>
            </div>

            <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start' }}>

                {/* Left sidebar */}
                <QuizSectionSidebar
                    sections={sidebarSections}
                    answers={answers}
                    activeSectionId={activeSectionId}
                    onScrollTo={scrollToSection}
                    reviewMode
                    reviewDecisions={reviewDecisions}
                />

                {/* Centre: questions */}
                <div style={{ flex: 1, minWidth: 0, padding: '24px 20px 80px' }}>
                    {/* Recruit info strip */}
                    <div style={{
                        display: 'flex', gap: 24, flexWrap: 'wrap',
                        padding: '10px 16px', marginBottom: 24,
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(0,0,0,0.25)',
                        fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)',
                    }}>
                        <span><span style={{ color: 'rgba(219,0,29,0.55)' }}>Recruit:</span> {attempt.userName}</span>
                        <span><span style={{ color: 'rgba(219,0,29,0.55)' }}>Assigned by:</span> {attempt.assignedByName}</span>
                        {attempt.timeTakenSeconds !== undefined && (
                            <span><span style={{ color: 'rgba(219,0,29,0.55)' }}>Time taken:</span> {formatTime(attempt.timeTakenSeconds)}</span>
                        )}
                        {attempt.submittedAt && (
                            <span><span style={{ color: 'rgba(219,0,29,0.55)' }}>Submitted:</span> {new Date(attempt.submittedAt).toLocaleString()}</span>
                        )}
                    </div>

                    {/* Questions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                        {(() => {
                            let globalOffset = 0
                            return quiz.sections.map((section, si) => {
                                const offset = globalOffset
                                globalOffset += section.questions.length
                                return (
                                    <div key={section.id} id={`section-${section.id}`}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            marginBottom: 12, paddingBottom: 8,
                                            borderBottom: `1px solid rgba(219,0,29,0.2)`,
                                        }}>
                                            <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>
                                                {String(si + 1).padStart(2, '0')}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)' }}>
                                                {section.title}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {section.questions.map((q, qi) => {
                                                const isWritten = q.type !== 'multiple_choice'
                                                // MC: auto-grade; written: use reviewer's manual decision
                                                const rsAuto = autoReviewState(q, answers)
                                                const rsManual = reviewDecisions[q.id]
                                                const reviewState: 'correct' | 'needs_review' | 'incorrect' | null =
                                                    isWritten
                                                        ? rsManual ?? 'needs_review'
                                                        : rsAuto ?? 'needs_review'
                                                return (
                                                    <QuizQuestionCard
                                                        key={q.id}
                                                        questionIndex={offset + qi}
                                                        question={q}
                                                        value={answers[q.id] ?? null}
                                                        readOnly
                                                        reviewState={reviewState}
                                                        onReviewDecision={
                                                            isWritten && !isClosed
                                                                ? (d) => setReviewDecisions(prev => ({ ...prev, [q.id]: d }))
                                                                : undefined
                                                        }
                                                    />
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>

                    {/* Bottom action panel */}
                    {!isClosed && !submitted && (
                        <div style={{ marginTop: 32, border: '1px solid rgba(255,255,255,0.1)', borderTop: `2px solid ${RED}` }}>
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.35)' }}>
                                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>
                                    {'// DECISION'}
                                </span>
                            </div>
                            <ReviewActionPanel />
                        </div>
                    )}
                </div>

                {/* Right: time taken + decision panel */}
                <div style={{
                    width: 210, flexShrink: 0,
                    position: 'sticky', top: 80,
                    alignSelf: 'flex-start',
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                }}>
                    {/* Time taken */}
                    <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: '0.47rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                            {'// TIME TAKEN'}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.06em', fontFamily: 'monospace', color: 'rgba(237,237,237,0.85)', lineHeight: 1 }}>
                            {attempt.timeTakenSeconds !== undefined ? formatTime(attempt.timeTakenSeconds) : '——:——'}
                        </div>
                        <div style={{ marginTop: 6, fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)' }}>
                            of {attempt.timeLimitMinutes}m allowed
                        </div>
                    </div>

                    {/* Status */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.47rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', marginBottom: 6 }}>
                            Status
                        </div>
                        <span style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: attempt.status === 'passed'  ? 'rgba(34,197,94,0.85)'
                                 : attempt.status === 'failed'  ? 'rgba(239,68,68,0.85)'
                                 :                                'rgba(245,158,11,0.85)',
                        }}>
                            {attempt.status.replace('_', ' ')}
                        </span>
                    </div>

                    {/* Decision panel */}
                    <ReviewActionPanel />
                </div>
            </div>
        </>
    )
}
