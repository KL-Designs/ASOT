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

/** Returns total possible points for the quiz (each answerBox = 1 pt). */
function computeTotal(quiz: QuizDefinition): number {
    return quiz.sections.flatMap(s => s.questions).reduce((sum, q) => sum + (q.answerBoxes ?? 1), 0)
}

/** Auto-grade multiple-choice; 1 if correct, 0 otherwise. */
function autoScore(question: QuizQuestion, answers: Record<string, string | null>): number {
    const value = answers[question.id]
    if (!value || value.trim() === '') return 0
    if (question.type === 'multiple_choice' && question.correctOption !== undefined && question.options) {
        return value === question.options[question.correctOption] ? 1 : 0
    }
    return 0
}

/** Compute earned points from reviewer decisions + auto-graded MC. */
function computeScore(
    quiz: QuizDefinition,
    answers: Record<string, string | null>,
    reviewDecisions: Record<string, 'correct' | 'incorrect'>,
): number {
    let earned = 0
    for (const section of quiz.sections) {
        for (const q of section.questions) {
            const boxes = q.answerBoxes ?? 1
            if (q.type === 'multiple_choice') {
                earned += autoScore(q, answers)
            } else if (boxes > 1) {
                for (let i = 0; i < boxes; i++) {
                    if (reviewDecisions[`${q.id}[${i}]`] === 'correct') earned++
                }
            } else {
                if (reviewDecisions[q.id] === 'correct') earned++
            }
        }
    }
    return earned
}

/** Overall reviewState for a multi-box question card border. */
function multiBoxReviewState(
    qId: string,
    boxes: number,
    reviewDecisions: Record<string, 'correct' | 'incorrect'>,
): 'correct' | 'needs_review' | 'incorrect' {
    const decisions = Array.from({ length: boxes }, (_, i) => reviewDecisions[`${qId}[${i}]`] ?? null)
    if (decisions.some(d => !d)) return 'needs_review'
    if (decisions.every(d => d === 'incorrect')) return 'incorrect'
    return 'correct'
}

export default function QuizReviewClient({ quiz, attempt, canEscalate, isJ4 }: Props) {
    const router = useRouter()
    const [activeSectionId, setActiveSectionId] = useState<string | null>(quiz.sections[0]?.id ?? null)
    const [decision, setDecision] = useState<ReviewDecision | null>(null)
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Unified decisions map:
    //   single-answer written/image  → key: q.id
    //   multi-box written/image       → key: `${q.id}[${boxIndex}]`
    const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'correct' | 'incorrect'>>({})

    const isClosed = ['passed', 'failed'].includes(attempt.status)

    const answers: Record<string, string | null> = {}
    for (const section of quiz.sections) {
        for (const q of section.questions) answers[q.id] = null
    }
    for (const a of attempt.answers) answers[a.questionId] = a.value

    const totalPoints = computeTotal(quiz)
    const passMarkPoints = quiz.passMarkPoints ?? Math.ceil(totalPoints * 0.75)
    const earnedPoints = computeScore(quiz, answers, reviewDecisions)
    const isPassing = earnedPoints >= passMarkPoints

    // All written/image questions that require manual marking
    const writtenQuestions = quiz.sections.flatMap(s => s.questions).filter(q => q.type !== 'multiple_choice')

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

        if (decision !== 'send_for_review') {
            const unmarked = writtenQuestions.filter(q => {
                const boxes = q.answerBoxes ?? 1
                if (boxes > 1) {
                    for (let i = 0; i < boxes; i++) {
                        if (!reviewDecisions[`${q.id}[${i}]`]) return true
                    }
                    return false
                }
                return !reviewDecisions[q.id]
            })
            if (unmarked.length > 0) {
                setError(`Please mark all written questions before submitting. ${unmarked.length} question(s) still need marking.`)
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
                    score: earnedPoints,
                    totalPoints,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Failed to submit decision.')
            } else {
                setSubmitted(true)
                setTimeout(() => router.push('/dashboard/j3'), 1500)
            }
        } finally {
            setSubmitting(false)
        }
    }

    // For the sidebar tick logic: multi-box questions tick when all boxes are decided
    const sidebarReviewDecisions = { ...reviewDecisions }
    for (const q of writtenQuestions) {
        const boxes = q.answerBoxes ?? 1
        if (boxes > 1) {
            const allMarked = Array.from({ length: boxes }, (_, i) => reviewDecisions[`${q.id}[${i}]`]).every(Boolean)
            if (allMarked) sidebarReviewDecisions[q.id] = 'correct'
        }
    }

    const sidebarSections = quiz.sections.map(s => ({
        id: s.id,
        title: s.title,
        questions: s.questions.map(q => ({ id: q.id })),
    }))

    // Button style: faint colour by default, bright when selected
    const decisionBtnSx = (active: boolean, variant: 'pass' | 'fail' | 'review') => {
        const colors = {
            pass:   { faint: 'rgba(34,197,94,0.25)',  bright: 'rgba(34,197,94,0.7)',  faintBg: 'rgba(34,197,94,0.05)',  brightBg: 'rgba(34,197,94,0.18)',  text: 'rgba(34,197,94,0.9)'  },
            fail:   { faint: 'rgba(239,68,68,0.25)',  bright: 'rgba(239,68,68,0.7)',  faintBg: 'rgba(239,68,68,0.05)',  brightBg: 'rgba(239,68,68,0.18)',  text: 'rgba(239,68,68,0.9)'  },
            review: { faint: 'rgba(245,158,11,0.25)', bright: 'rgba(245,158,11,0.7)', faintBg: 'rgba(245,158,11,0.05)', brightBg: 'rgba(245,158,11,0.12)', text: 'rgba(245,158,11,0.9)' },
        }
        const c = colors[variant]
        return {
            all: 'unset' as const,
            cursor: 'pointer' as const,
            padding: '8px 14px',
            border: `1px solid ${active ? c.bright : c.faint}`,
            background: active ? c.brightBg : c.faintBg,
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: active ? c.text : c.text.replace('0.9', '0.5'),
            transition: 'all 0.12s',
            flex: 1, textAlign: 'center' as const,
        }
    }

    const ReviewActionPanel = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {!isClosed && !submitted && (
                <>
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
                    reviewDecisions={sidebarReviewDecisions}
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
                            <span><span style={{ color: 'rgba(219,0,29,0.55)' }}>Submitted:</span> {new Date(attempt.submittedAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
                                            <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)' }}>
                                                {section.title}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {section.questions.map((q, qi) => {
                                                const isWritten = q.type !== 'multiple_choice'
                                                const boxes = q.answerBoxes ?? 1
                                                const isMultiBox = boxes > 1

                                                // Derive review state for card border
                                                let reviewState: 'correct' | 'needs_review' | 'incorrect' | null
                                                if (!isWritten) {
                                                    const sc = autoScore(q, answers)
                                                    reviewState = answers[q.id] ? (sc > 0 ? 'correct' : 'incorrect') : 'needs_review'
                                                } else if (isMultiBox) {
                                                    reviewState = multiBoxReviewState(q.id, boxes, reviewDecisions)
                                                } else {
                                                    reviewState = reviewDecisions[q.id] ?? 'needs_review'
                                                }

                                                return (
                                                    <QuizQuestionCard
                                                        key={q.id}
                                                        questionIndex={offset + qi}
                                                        question={q}
                                                        value={answers[q.id] ?? null}
                                                        readOnly
                                                        reviewState={reviewState}
                                                        // Single-answer written
                                                        onReviewDecision={
                                                            isWritten && !isMultiBox && !isClosed
                                                                ? (d) => setReviewDecisions(prev => ({ ...prev, [q.id]: d }))
                                                                : undefined
                                                        }
                                                        // Multi-box written
                                                        boxReviewStates={
                                                            isWritten && isMultiBox
                                                                ? Array.from({ length: boxes }, (_, i) => reviewDecisions[`${q.id}[${i}]`] ?? null)
                                                                : undefined
                                                        }
                                                        onBoxReviewDecision={
                                                            isWritten && isMultiBox && !isClosed
                                                                ? (boxIdx, d) => setReviewDecisions(prev => ({ ...prev, [`${q.id}[${boxIdx}]`]: d }))
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
                                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>
                                    {'// DECISION'}
                                </span>
                            </div>
                            <ReviewActionPanel />
                        </div>
                    )}
                </div>

                {/* Right panel: time, score, status, decision */}
                <div style={{
                    width: 210, flexShrink: 0,
                    position: 'sticky', top: 80,
                    alignSelf: 'flex-start',
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                }}>
                    {/* Time taken */}
                    <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
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

                    {/* Score */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.47rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', marginBottom: 8 }}>
                            {'// SCORE'}
                        </div>
                        <div style={{
                            fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'monospace', lineHeight: 1,
                            color: isClosed
                                ? attempt.status === 'passed' ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)'
                                : isPassing ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.75)',
                        }}>
                            {earnedPoints} <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>/ {totalPoints}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)' }}>
                            Pass mark: {passMarkPoints} / {totalPoints}
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginTop: 8, height: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                                position: 'absolute', left: 0, top: 0, height: '100%',
                                width: `${Math.min(100, (earnedPoints / totalPoints) * 100)}%`,
                                background: isPassing ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.6)',
                                transition: 'width 0.3s, background 0.3s',
                            }} />
                            {/* Pass mark indicator */}
                            <div style={{
                                position: 'absolute', top: 0, height: '100%', width: 1,
                                left: `${(passMarkPoints / totalPoints) * 100}%`,
                                background: 'rgba(255,255,255,0.4)',
                            }} />
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
