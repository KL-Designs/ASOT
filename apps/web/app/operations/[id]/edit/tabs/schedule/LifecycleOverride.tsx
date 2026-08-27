'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/confirm-dialog'
import { STAGE_ORDER, stageIndex, stageLabel, nextStage } from '@/lib/operations/stage'
import type { AttendanceStage } from '@/lib/operations/schedule'
import { btnTone, chip, label, selectStyle } from './controls'

/** The four lifecycle statuses, and what each one actually does. */
const STATUS_OPTS = [
    {
        value: 'In Development',
        tone: 'crit' as const,
        effect: 'Suspends all automation. RSVP will not open or close and the operation will not activate.',
    },
    {
        value: 'Upcoming',
        tone: 'warn' as const,
        effect: 'Automation runs. The operation activates by itself at its start time.',
    },
    {
        value: 'Active',
        tone: 'good' as const,
        effect: 'The operation is running. Marking it completed opens attendance confirmation.',
    },
    {
        value: 'Completed',
        tone: 'acc' as const,
        effect: 'Opens attendance confirmation and issues squad-leader tasks. Confirmation closes 24 hours later.',
    },
]

interface Props {
    status: string
    /** `operations.overrideLifecycle`. Without it, status and backwards stage
     *  moves are read-only; Advance still works. */
    canOverride: boolean
    onChangeStatus: (v: string) => void
    onCompleteMission: () => void
    completingMission: boolean

    stage: AttendanceStage | null
    /** Forward progression — the next stage only. Confirms for the three
     *  impactful stages live in page.tsx's requestStageChange, which both of
     *  these route to; owning a second copy here would double-prompt. */
    onAdvance: (to: AttendanceStage) => void
    /** Jump to any stage, including backwards. The override proper. */
    onSelectStage: (to: AttendanceStage) => void
    advancing: boolean
}

/**
 * The two manual overrides on the operation's automation, in one place.
 *
 * Both were previously somewhere else and neither said what it did. Status was
 * a bare `<select>` in the deck's Details sidebar, between Department and
 * Cover, as though it were metadata — it is not: "In Development" silently
 * suspends every automation the ribbon describes, and "Completed" opens
 * attendance confirmation and issues tasks to squad leaders. Stage was its own
 * panel titled "Stage", which read as a third drawing of the timeline rather
 * than as the correction tool it is.
 *
 * They belong together because they are the same kind of thing: what the
 * system believes, set by hand, against what the schedule would otherwise do.
 *
 * The two halves are gated differently, and the split is the real distinction
 * rather than a convenience:
 *
 * - **Advance** moves to the next stage only. That is ordinary progression —
 *   the cron does it unattended — so it stays available to anyone who could
 *   already reach this tab, and its server gate is unchanged.
 * - **Status, and clicking a stage segment** (which can jump anywhere,
 *   including backwards) are overrides, and need `operations.overrideLifecycle`.
 *   Backwards stage correction was previously ungated entirely.
 */
export default function LifecycleOverride({
    status, canOverride, onChangeStatus, onCompleteMission, completingMission,
    stage, onAdvance, onSelectStage, advancing,
}: Props) {
    const [pendingStatus, setPendingStatus] = useState<string | null>(null)
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)

    const current = STATUS_OPTS.find(o => o.value === status)
    const currentIdx = stageIndex(stage)
    const next = nextStage(stage)

    return (
        <>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ── status ── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ ...label, minWidth: 58 }}>Status</span>

                        {canOverride ? (
                            <select
                                value={status}
                                onChange={e => setPendingStatus(e.target.value)}
                                style={{ ...selectStyle, width: 'auto', minWidth: 200, color: 'var(--ink)', fontWeight: 700 }}
                            >
                                {STATUS_OPTS.map(o => (
                                    <option key={o.value} value={o.value}>{o.value}</option>
                                ))}
                            </select>
                        ) : (
                            <span style={chip(current?.tone)}>{status}</span>
                        )}

                        {status === 'Active' && (
                            <button
                                type="button"
                                onClick={onCompleteMission}
                                disabled={completingMission}
                                style={{ ...btnTone('acc'), marginLeft: 'auto', opacity: completingMission ? 0.6 : 1 }}
                            >
                                {completingMission ? 'Completing…' : 'Complete mission'}
                            </button>
                        )}
                    </div>

                    <div style={{ marginTop: 9, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: '80ch' }}>
                        {current?.effect}
                        {!canOverride && (
                            <> Read-only — you do not have the lifecycle override permission. The status still moves
                            on its own as the stage advances.</>
                        )}
                    </div>
                </div>

                {/* ── stage ── */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <span style={{ ...label, minWidth: 58 }}>Stage</span>
                        <span style={chip('acc')}>{stageLabel(stage)}</span>
                        <button
                            type="button"
                            disabled={!next || advancing}
                            onClick={() => next && onAdvance(next)}
                            style={{
                                ...btnTone('acc'),
                                marginLeft: 'auto',
                                opacity: next && !advancing ? 1 : 0.5,
                                cursor: next && !advancing ? 'pointer' : 'default',
                            }}
                        >
                            {advancing ? 'Advancing…' : next ? `Advance to ${stageLabel(next)}` : 'Complete'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {STAGE_ORDER.map((st, i) => {
                            const isCurrent = i === currentIdx
                            const disabled = isCurrent || advancing || !canOverride
                            const isHovered = hoverIdx === i && !disabled
                            const isFilled = i <= currentIdx
                            return (
                                <button
                                    key={st}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => onSelectStage(st)}
                                    onMouseEnter={() => setHoverIdx(i)}
                                    onMouseLeave={() => setHoverIdx(null)}
                                    aria-label={`Set stage to ${stageLabel(st)}`}
                                    title={canOverride ? `Set stage to ${stageLabel(st)}` : 'Lifecycle override permission required'}
                                    style={{
                                        flex: '1 1 0', padding: '6px 0', margin: 0,
                                        border: 'none', background: 'none',
                                        cursor: disabled ? 'default' : 'pointer',
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
                                        fontFamily: 'var(--mono)', fontSize: 10,
                                        letterSpacing: '0.1em', textTransform: 'uppercase',
                                        color: isCurrent ? 'var(--acc)' : 'var(--ink-3)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>{stageLabel(st)}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: '80ch' }}>
                        {canOverride
                            ? 'The cron normally advances this on its own. Click any segment to correct it — including backwards, if the cron or a person got it wrong.'
                            : 'The cron normally advances this on its own. Correcting it by hand, including moving backwards, needs the lifecycle override permission.'}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={pendingStatus !== null}
                title="Override lifecycle status"
                message={
                    pendingStatus
                        ? `Set this operation to "${pendingStatus}"? ${STATUS_OPTS.find(o => o.value === pendingStatus)?.effect ?? ''}`
                        : ''
                }
                confirmLabel="Set status"
                danger={pendingStatus === 'In Development' || pendingStatus === 'Completed'}
                onConfirm={() => { const v = pendingStatus!; setPendingStatus(null); onChangeStatus(v) }}
                onCancel={() => setPendingStatus(null)}
            />
        </>
    )
}
