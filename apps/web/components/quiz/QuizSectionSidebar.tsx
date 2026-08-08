'use client'

import { useEffect, useRef, useState } from 'react'

const RED = '#db001d'

interface SidebarSection {
    id: string
    title: string
    questions: { id: string }[]
}

interface Props {
    sections: SidebarSection[]
    answers: Record<string, string | null>
    activeSectionId: string | null
    onScrollTo: (sectionId: string) => void
    reviewMode?: boolean
    /** In review mode: which written questions the reviewer has explicitly marked */
    reviewDecisions?: Record<string, 'correct' | 'incorrect'>
}

function isAnswered(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && value.trim() !== ''
}

export default function QuizSectionSidebar({
    sections, answers, activeSectionId, onScrollTo, reviewMode, reviewDecisions,
}: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set([sections[0]?.id ?? '']))

    // Auto-expand active section
    useEffect(() => {
        if (activeSectionId) {
            setExpanded(prev => {
                if (prev.has(activeSectionId)) return prev
                const next = new Set(prev)
                next.add(activeSectionId)
                return next
            })
        }
    }, [activeSectionId])

    function toggle(id: string) {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Compute global question offset for each section
    const sectionOffsets: Record<string, number> = {}
    let offset = 0
    for (const s of sections) {
        sectionOffsets[s.id] = offset
        offset += s.questions.length
    }

    return (
        <div style={{
            width: 200,
            flexShrink: 0,
            position: 'sticky',
            top: 80,
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 24,
        }}>
            <div style={{
                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em',
                textTransform: 'uppercase', color: 'rgba(219,0,29,0.45)',
                padding: '20px 16px 10px',
                fontFamily: 'monospace',
            }}>
                {reviewMode ? '// REVIEW' : '// SECTIONS'}
            </div>

            {sections.map((section, si) => {
                const isActive = activeSectionId === section.id
                const isOpen = expanded.has(section.id)
                const globalOffset = sectionOffsets[section.id]

                // Answered / reviewed count
                const doneCount = section.questions.filter(q => {
                    if (reviewMode) {
                        // In review mode: question is "done" when it has an answer (for MC auto-graded)
                        // OR when the reviewer has explicitly marked it (for written)
                        const answered = isAnswered(answers[q.id])
                        const marked = reviewDecisions?.[q.id] !== undefined
                        // We show ticked when either auto-reviewed (MC) or manually marked
                        return answered && (marked || answers[q.id] !== null)
                    }
                    return isAnswered(answers[q.id])
                }).length
                const total = section.questions.length
                const allDone = doneCount === total

                return (
                    <div key={section.id}>
                        <button
                            onClick={() => { toggle(section.id); if (!isOpen) onScrollTo(section.id) }}
                            style={{
                                all: 'unset',
                                display: 'flex', alignItems: 'center', gap: 8,
                                width: '100%', padding: '7px 16px',
                                cursor: 'pointer', boxSizing: 'border-box',
                                borderLeft: isActive ? `3px solid ${RED}` : '3px solid transparent',
                                background: isActive ? 'rgba(219,0,29,0.08)' : 'transparent',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{
                                fontSize: '0.5rem', fontWeight: 700,
                                color: isActive ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.2)',
                                letterSpacing: '0.15em', flexShrink: 0, fontFamily: 'monospace',
                            }}>
                                {String(si + 1).padStart(2, '0')}
                            </span>
                            <span style={{
                                fontSize: '0.62rem', fontWeight: isActive ? 700 : 500,
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.45)',
                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {section.title}
                            </span>
                            {/* Progress count */}
                            <span style={{
                                fontSize: '0.52rem', fontWeight: 700, flexShrink: 0,
                                color: allDone ? 'rgba(34,197,94,0.8)' : 'rgba(237,237,237,0.22)',
                                fontFamily: 'monospace',
                            }}>
                                {reviewMode ? (reviewDecisions ? `${section.questions.filter(q => reviewDecisions[q.id] !== undefined || /* MC */ false).length}/${total}` : '') : `${doneCount}/${total}`}
                            </span>
                        </button>

                        {isOpen && (
                            <div>
                                {section.questions.map((q, qi) => {
                                    const globalNum = globalOffset + qi + 1
                                    // Tick logic
                                    let ticked: boolean
                                    if (reviewMode) {
                                        // Ticked when reviewer has explicitly marked it OR it's answered + MC
                                        ticked = reviewDecisions?.[q.id] !== undefined || isAnswered(answers[q.id])
                                    } else {
                                        ticked = isAnswered(answers[q.id])
                                    }
                                    return (
                                        <button
                                            key={q.id}
                                            onClick={() => {
                                                const el = document.getElementById(`question-${q.id}`)
                                                if (el) {
                                                    const top = el.getBoundingClientRect().top + window.scrollY - 80
                                                    window.scrollTo({ top, behavior: 'smooth' })
                                                }
                                            }}
                                            style={{
                                                all: 'unset',
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                width: '100%', cursor: 'pointer', boxSizing: 'border-box',
                                                padding: '5px 16px 5px 34px',
                                            }}
                                        >
                                            <span style={{
                                                width: 14, height: 14, flexShrink: 0,
                                                borderRadius: '50%',
                                                border: ticked ? 'none' : '1px solid rgba(255,255,255,0.18)',
                                                background: ticked ? 'rgba(34,197,94,0.85)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {ticked && (
                                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                                        <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </span>
                                            <span style={{
                                                fontSize: '0.6rem',
                                                color: ticked ? 'rgba(237,237,237,0.65)' : 'rgba(237,237,237,0.32)',
                                                letterSpacing: '0.02em',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                Q{globalNum}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
