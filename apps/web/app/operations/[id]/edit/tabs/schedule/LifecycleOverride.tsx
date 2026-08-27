'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/confirm-dialog'
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
    /** `operations.overrideLifecycle`. Without it this renders read-only. */
    canOverride: boolean
    onChangeStatus: (v: string) => void
    /** Shown only while the operation is Active, same gate the old button had. */
    onCompleteMission: () => void
    completingMission: boolean
}

/**
 * Setting the operation's lifecycle status by hand.
 *
 * This was a plain `<select>` in the deck's Details sidebar, sitting between
 * Department and Cover Image as though it were metadata. It is not metadata:
 * "In Development" silently suspends every automation this tab describes, and
 * "Completed" opens attendance confirmation and issues tasks to squad leaders.
 * Neither belongs in a list of fields you tab through while filling in a
 * mission, and neither should be reachable by everyone who can edit one.
 *
 * So it moved here — beside the ribbon whose behaviour it changes — and behind
 * its own permission. Normal progression does not need it: the stage machine
 * writes the stage, and the server derives the status from that
 * (`statusForStage`). This is the escape hatch for when the derived answer is
 * wrong, which is exactly the case that warrants an explicit confirm.
 */
export default function LifecycleOverride({
    status, canOverride, onChangeStatus, onCompleteMission, completingMission,
}: Props) {
    const [pending, setPending] = useState<string | null>(null)

    const current = STATUS_OPTS.find(o => o.value === status)

    return (
        <>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={label}>Status</span>

                    {canOverride ? (
                        <select
                            value={status}
                            onChange={e => setPending(e.target.value)}
                            style={{ ...selectStyle, width: 'auto', minWidth: 190, color: 'var(--ink)', fontWeight: 700 }}
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

                <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: '68ch' }}>
                    {current?.effect}
                    {!canOverride && (
                        <> You do not have the lifecycle override permission, so this is read-only. The status still
                        moves on its own as the stage advances.</>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={pending !== null}
                title="Override lifecycle status"
                message={
                    pending
                        ? `Set this operation to "${pending}"? ${STATUS_OPTS.find(o => o.value === pending)?.effect ?? ''}`
                        : ''
                }
                confirmLabel="Set status"
                danger={pending === 'In Development' || pending === 'Completed'}
                onConfirm={() => { const v = pending!; setPending(null); onChangeStatus(v) }}
                onCancel={() => setPending(null)}
            />
        </>
    )
}
