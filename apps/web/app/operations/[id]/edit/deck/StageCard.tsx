'use client'

import Panel from './Panel'
import { STAGE_ORDER, stageLabel, stageProgress, nextStage } from '@/lib/operations/stage'
import type { AttendanceStage } from '@/lib/operations/schedule'

interface Props {
    stage: AttendanceStage | null
    onAdvance: (to: AttendanceStage) => void
    advancing: boolean
}

/**
 * Replaces the six-step labelled stepper in the Attendance Settings panel.
 * The cron (`app/api/cron/operations/`) drives these transitions normally —
 * this is a manual override, not a primary input, so it's a thin progress
 * bar plus one Advance button rather than a clickable-to-any-stage stepper.
 */
export default function StageCard({ stage, onAdvance, advancing }: Props) {
    const filled = stageProgress(stage)
    const next = nextStage(stage)

    return (
        <Panel title="Stage" tag={`${filled} of ${STAGE_ORDER.length}`}>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {STAGE_ORDER.map((s, i) => (
                        <span key={s} style={{
                            flex: '1 1 0', height: 3, borderRadius: 2,
                            background: i < filled ? 'var(--acc)' : 'var(--line)',
                        }} />
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{
                        fontFamily: 'var(--mono)', fontSize: 12,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: 'var(--acc)',
                    }}>
                        {stageLabel(stage)}
                    </span>

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
        </Panel>
    )
}
