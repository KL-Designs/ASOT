'use client'

import { useState } from 'react'
import TabPanel from '../TabPanel'
import { STAGE_ORDER, stageIndex, stageLabel, stageProgress, nextStage } from '@/lib/operations/stage'
import type { AttendanceStage } from '@/lib/operations/schedule'

interface Props {
    stage: AttendanceStage | null
    onAdvance: (to: AttendanceStage) => void
    /** Segment click — jump directly to any stage, including backwards. The
     * caller (page.tsx) is responsible for confirming the same three
     * impactful stages the old stepper guarded before committing. */
    onSelect: (to: AttendanceStage) => void
    advancing: boolean
}

/**
 * Replaces the six-step labelled stepper in the Attendance Settings panel.
 * The cron (`app/api/cron/operations/`) drives these transitions normally,
 * so Advance — the obvious primary action — only ever targets the next
 * stage. But the old stepper also let HQ jump to *any* stage, including
 * backwards to correct a mistake (the cron's or a person's) — losing that
 * would mean a wrong stage could only be fixed by editing the database. So
 * the six progress segments stay individually clickable as the override.
 *
 * Moved here from the deck's Stage card (Task 5) — the third and final
 * Schedule tab panel, after Pre-Production and RSVP Window. The deck's
 * forced 340px width could only fit a bare 3px bar per segment, with each
 * stage's name reachable solely via `aria-label`; the tab's full width
 * brings the visible label back under each segment.
 */
export default function StagePanel({ stage, onAdvance, onSelect, advancing }: Props) {
    const filled = stageProgress(stage)
    const next = nextStage(stage)
    const currentIdx = stageIndex(stage)
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)

    return (
        <TabPanel title='Stage' horizon='run day'>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {STAGE_ORDER.map((s, i) => {
                        const isCurrent = i === currentIdx
                        const isHovered = hoverIdx === i && !isCurrent && !advancing
                        const isFilled = i < filled
                        return (
                            <button
                                key={s}
                                type="button"
                                disabled={isCurrent || advancing}
                                onClick={() => onSelect(s)}
                                onMouseEnter={() => setHoverIdx(i)}
                                onMouseLeave={() => setHoverIdx(null)}
                                aria-label={`Set stage to ${stageLabel(s)}`}
                                style={{
                                    flex: '1 1 0', padding: '6px 0', margin: 0,
                                    border: 'none', background: 'none',
                                    cursor: isCurrent || advancing ? 'default' : 'pointer',
                                }}
                            >
                                <span style={{
                                    display: 'block', height: 3, borderRadius: 2,
                                    background: isFilled
                                        ? (isHovered ? 'rgba(var(--acc-rgb), 0.7)' : 'var(--acc)')
                                        : (isHovered ? 'var(--line-2)' : 'var(--line)'),
                                }} />
                                <span style={{
                                    display: 'block', marginTop: 7,
                                    fontFamily: 'var(--mono)', fontSize: 8.5,
                                    letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: isCurrent ? 'var(--acc)' : 'var(--ink-3)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{stageLabel(s)}</span>
                            </button>
                        )
                    })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
                    <button
                        type="button"
                        disabled={!next || advancing}
                        onClick={() => next && onAdvance(next)}
                        style={{
                            border: '1px solid var(--line-2)', background: 'var(--s2)',
                            borderRadius: 'var(--r)', padding: '6px 11px',
                            fontFamily: 'var(--mono)', fontSize: 9.5,
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            color: next ? 'var(--ink-2)' : 'var(--ink-3)',
                            cursor: next ? 'pointer' : 'default',
                            opacity: next ? 1 : 0.5,
                        }}
                    >
                        {advancing ? 'Advancing…' : next ? `Advance to ${stageLabel(next)}` : 'Complete'}
                    </button>
                </div>
            </div>
        </TabPanel>
    )
}
