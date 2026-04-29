'use client'

const RED = '#db001d'
const GREEN = 'rgba(34,197,94,0.85)'
const GREEN_BORDER = 'rgba(34,197,94,0.6)'
const RED_BORDER = 'rgba(239,68,68,0.6)'

// Named labels for the TFAR radio question boxes
const TFAR_LABELS = ['Control 1', 'Control 2', 'Control 3', 'Control 4', 'Control 5', 'Control 6']

function parseMultiBoxValue(raw: string | null, count: number): string[] {
    if (!raw) return Array(count).fill('')
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return Array.from({ length: count }, (_, i) => String(parsed[i] ?? ''))
    } catch { /* fall through */ }
    const lines = raw.split('\n')
    return Array.from({ length: count }, (_, i) => lines[i] ?? '')
}

function encodeMultiBoxValue(parts: string[]): string {
    return JSON.stringify(parts)
}

interface Props {
    /** 0-based GLOBAL question index across the entire quiz */
    questionIndex: number
    question: QuizQuestion
    value: string | null
    onChange?: (value: string) => void
    readOnly?: boolean
    // Single-answer review
    reviewState?: 'correct' | 'needs_review' | 'incorrect' | null
    onReviewDecision?: (decision: 'correct' | 'incorrect') => void
    // Multi-box review (used when question.answerBoxes > 1)
    boxReviewStates?: ('correct' | 'incorrect' | null)[]
    onBoxReviewDecision?: (boxIndex: number, decision: 'correct' | 'incorrect') => void
}

export default function QuizQuestionCard({
    questionIndex, question, value, onChange, readOnly,
    reviewState, onReviewDecision,
    boxReviewStates, onBoxReviewDecision,
}: Props) {
    const questionNumber = questionIndex + 1
    const boxes = question.answerBoxes ?? 1
    const isMultiBox = boxes > 1
    const multiParts = isMultiBox ? parseMultiBoxValue(value, boxes) : null
    const boxLabels = question.id === 'tf-1' ? TFAR_LABELS : null

    // Review border styling
    let reviewBorder = 'rgba(255,255,255,0.07)'
    let reviewTopBorder = 'rgba(219,0,29,0.4)'
    if (reviewState === 'correct') {
        reviewBorder    = 'rgba(34,197,94,0.4)'
        reviewTopBorder = 'rgba(34,197,94,0.8)'
    } else if (reviewState === 'needs_review') {
        reviewBorder    = 'rgba(234,179,8,0.4)'
        reviewTopBorder = 'rgba(234,179,8,0.8)'
    } else if (reviewState === 'incorrect') {
        reviewBorder    = 'rgba(239,68,68,0.4)'
        reviewTopBorder = 'rgba(239,68,68,0.8)'
    }

    return (
        <div
            id={`question-${question.id}`}
            style={{
                border: `1px solid ${reviewBorder}`,
                borderTop: `2px solid ${reviewTopBorder}`,
                background: 'rgba(0,0,0,0.25)',
                position: 'relative',
            }}
        >
            {/* Corner ticks */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 1, background: 'rgba(219,0,29,0.3)' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 10, background: 'rgba(219,0,29,0.3)' }} />
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 1, background: 'rgba(219,0,29,0.3)' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 10, background: 'rgba(219,0,29,0.3)' }} />
            </div>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(0,0,0,0.35)',
            }}>
                <span style={{
                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em',
                    color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace', flexShrink: 0,
                }}>
                    Q{String(questionNumber).padStart(2, '0')}
                </span>
                <span style={{
                    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: question.type === 'multiple_choice'
                        ? 'rgba(147,197,253,0.6)'
                        : question.type === 'image_question'
                            ? 'rgba(167,139,250,0.6)'
                            : 'rgba(237,237,237,0.25)',
                }}>
                    {question.type === 'multiple_choice' ? 'Multiple Choice' : question.type === 'image_question' ? 'Image' : 'Written'}
                </span>
                {isMultiBox && (
                    <span style={{
                        fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'rgba(219,0,29,0.45)',
                        fontFamily: 'monospace',
                    }}>
                        {boxes} pts
                    </span>
                )}
                {reviewState && (
                    <span style={{
                        marginLeft: 'auto',
                        fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: reviewState === 'correct' ? 'rgba(34,197,94,0.8)'
                            : reviewState === 'needs_review' ? 'rgba(234,179,8,0.8)'
                                : 'rgba(239,68,68,0.8)',
                        border: `1px solid ${reviewState === 'correct' ? 'rgba(34,197,94,0.35)' : reviewState === 'needs_review' ? 'rgba(234,179,8,0.35)' : 'rgba(239,68,68,0.35)'}`,
                        padding: '1px 7px',
                    }}>
                        {reviewState === 'correct' ? 'Correct' : reviewState === 'needs_review' ? 'Needs Review' : 'Incorrect'}
                    </span>
                )}
            </div>

            {/* Question text */}
            <div style={{ padding: '12px 16px 4px' }}>
                <p style={{
                    fontSize: '0.78rem', fontWeight: 500, color: 'rgba(237,237,237,0.88)',
                    lineHeight: 1.5, margin: 0,
                }}>
                    {question.question}
                </p>
            </div>

            {/* Image — centred with clear border */}
            {question.type === 'image_question' && question.image && (
                <div style={{ padding: '10px 16px', textAlign: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`/quiz-images/${question.image}.png`}
                        alt={question.question}
                        style={{
                            maxWidth: '100%', maxHeight: 320,
                            border: '1px solid rgba(255,255,255,0.28)',
                            background: 'rgba(255,255,255,0.04)',
                            objectFit: 'contain',
                            display: 'block',
                            margin: '0 auto',
                        }}
                        onError={e => {
                            const img = e.currentTarget
                            img.style.display = 'none'
                            const placeholder = img.nextElementSibling as HTMLElement | null
                            if (placeholder) placeholder.style.display = 'flex'
                        }}
                    />
                    <div style={{
                        display: 'none', alignItems: 'center', justifyContent: 'center',
                        height: 100, border: '1px dashed rgba(255,255,255,0.12)',
                        color: 'rgba(237,237,237,0.25)', fontSize: '0.65rem',
                        letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace',
                    }}>
                        Image: {question.image}
                    </div>
                </div>
            )}

            {/* Answer input */}
            <div style={{ padding: '8px 16px 16px' }}>
                {question.type === 'multiple_choice' && question.options ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {question.options.map((opt, i) => {
                            const selected = value === opt
                            return (
                                <button
                                    key={i}
                                    disabled={readOnly}
                                    onClick={() => !readOnly && onChange?.(opt)}
                                    style={{
                                        all: 'unset', cursor: readOnly ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px',
                                        border: selected ? `1px solid rgba(219,0,29,0.55)` : '1px solid rgba(255,255,255,0.1)',
                                        background: selected ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.03)',
                                        transition: 'all 0.1s',
                                        boxSizing: 'border-box', width: '100%',
                                    }}
                                >
                                    <span style={{
                                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                        border: selected ? `2px solid ${RED}` : '2px solid rgba(255,255,255,0.2)',
                                        background: selected ? RED : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: selected ? 'rgba(237,237,237,0.92)' : 'rgba(237,237,237,0.65)' }}>
                                        {opt}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                ) : isMultiBox && multiParts ? (
                    /* Multi-box answer inputs */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {multiParts.map((part, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <div style={{
                                    flexShrink: 0,
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                                    color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace',
                                    paddingTop: 10, whiteSpace: 'nowrap',
                                }}>
                                    {boxLabels ? `${String(i + 1).padStart(2, '0')} — ${boxLabels[i]}` : String(i + 1).padStart(2, '0')}
                                </div>
                                <textarea
                                    value={part}
                                    readOnly={readOnly}
                                    onChange={e => {
                                        if (readOnly || !onChange) return
                                        const next = [...multiParts]
                                        next[i] = e.target.value
                                        onChange(encodeMultiBoxValue(next))
                                    }}
                                    placeholder={readOnly ? '' : `Answer ${i + 1}…`}
                                    rows={2}
                                    style={{
                                        flex: 1, boxSizing: 'border-box',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.88)',
                                        fontSize: '0.75rem', lineHeight: 1.5,
                                        padding: '8px 10px', resize: 'vertical', outline: 'none',
                                        fontFamily: 'inherit',
                                    }}
                                    onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = 'rgba(219,0,29,0.4)' }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <textarea
                        value={value ?? ''}
                        readOnly={readOnly}
                        onChange={e => !readOnly && onChange?.(e.target.value)}
                        placeholder={readOnly ? '' : 'Type your answer here…'}
                        rows={3}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.88)',
                            fontSize: '0.78rem', lineHeight: 1.6,
                            padding: '10px 12px', resize: 'vertical', outline: 'none',
                            fontFamily: 'inherit',
                        }}
                        onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = 'rgba(219,0,29,0.4)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                    />
                )}
            </div>

            {/* Single-answer reviewer toggle */}
            {onReviewDecision && question.type !== 'multiple_choice' && !isMultiBox && (
                <div style={{
                    padding: '8px 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', gap: 8, alignItems: 'center',
                }}>
                    <span style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em',
                        textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)',
                        fontFamily: 'monospace', marginRight: 4,
                    }}>
                        Mark:
                    </span>
                    <button
                        onClick={() => onReviewDecision('correct')}
                        style={{
                            all: 'unset', cursor: 'pointer', padding: '5px 14px',
                            border: reviewState === 'correct' ? `1px solid ${GREEN_BORDER}` : '1px solid rgba(255,255,255,0.12)',
                            background: reviewState === 'correct' ? 'rgba(34,197,94,0.18)' : 'transparent',
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: reviewState === 'correct' ? 'rgba(34,197,94,0.9)' : 'rgba(237,237,237,0.45)',
                            transition: 'all 0.12s',
                        }}
                    >
                        ✓ Correct
                    </button>
                    <button
                        onClick={() => onReviewDecision('incorrect')}
                        style={{
                            all: 'unset', cursor: 'pointer', padding: '5px 14px',
                            border: reviewState === 'incorrect' ? `1px solid ${RED_BORDER}` : '1px solid rgba(255,255,255,0.12)',
                            background: reviewState === 'incorrect' ? 'rgba(239,68,68,0.18)' : 'transparent',
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: reviewState === 'incorrect' ? 'rgba(239,68,68,0.9)' : 'rgba(237,237,237,0.45)',
                            transition: 'all 0.12s',
                        }}
                    >
                        ✗ Incorrect
                    </button>
                </div>
            )}

            {/* Multi-box reviewer toggles — one per answer box */}
            {onBoxReviewDecision && question.type !== 'multiple_choice' && isMultiBox && (
                <div style={{
                    padding: '8px 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em',
                        textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)',
                        fontFamily: 'monospace', marginBottom: 8,
                    }}>
                        Mark each answer:
                    </div>
                    {Array.from({ length: boxes }, (_, i) => {
                        const state = boxReviewStates?.[i] ?? null
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < boxes - 1 ? 6 : 0 }}>
                                <span style={{
                                    fontSize: '0.52rem', fontWeight: 700, color: 'rgba(219,0,29,0.5)',
                                    fontFamily: 'monospace', letterSpacing: '0.1em', minWidth: 20,
                                }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <button
                                    onClick={() => onBoxReviewDecision(i, 'correct')}
                                    style={{
                                        all: 'unset', cursor: 'pointer', padding: '3px 10px',
                                        border: state === 'correct' ? `1px solid ${GREEN_BORDER}` : '1px solid rgba(255,255,255,0.1)',
                                        background: state === 'correct' ? 'rgba(34,197,94,0.18)' : 'transparent',
                                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                        color: state === 'correct' ? 'rgba(34,197,94,0.9)' : 'rgba(237,237,237,0.4)',
                                        transition: 'all 0.12s',
                                    }}
                                >
                                    ✓
                                </button>
                                <button
                                    onClick={() => onBoxReviewDecision(i, 'incorrect')}
                                    style={{
                                        all: 'unset', cursor: 'pointer', padding: '3px 10px',
                                        border: state === 'incorrect' ? `1px solid ${RED_BORDER}` : '1px solid rgba(255,255,255,0.1)',
                                        background: state === 'incorrect' ? 'rgba(239,68,68,0.18)' : 'transparent',
                                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                        color: state === 'incorrect' ? 'rgba(239,68,68,0.9)' : 'rgba(237,237,237,0.4)',
                                        transition: 'all 0.12s',
                                    }}
                                >
                                    ✗
                                </button>
                                {state && (
                                    <span style={{
                                        fontSize: '0.5rem', color: state === 'correct' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
                                        fontFamily: 'monospace',
                                    }}>
                                        1 pt
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
