export type AttendanceStage =
    | 'preparing' | 'rsvp_open' | 'rsvp_closed'
    | 'op_running' | 'confirmations_open' | 'completed'

export const STAGE_ORDER = [
    'preparing', 'rsvp_open', 'rsvp_closed',
    'op_running', 'confirmations_open', 'completed',
] as const satisfies readonly AttendanceStage[]

const LABELS: Record<AttendanceStage, string> = {
    preparing: 'Preparing',
    rsvp_open: 'Sign-Ups Open',
    rsvp_closed: 'Sign-Ups Closed',
    op_running: 'Op Running',
    confirmations_open: 'Confirmations Open',
    completed: 'Completed',
}

/** Unrecognised and missing stages both read as the start of the lifecycle. */
export function stageIndex(stage: AttendanceStage | null): number {
    const i = STAGE_ORDER.indexOf(stage as never)
    return i === -1 ? 0 : i
}

export function nextStage(stage: AttendanceStage | null): AttendanceStage | null {
    const i = stageIndex(stage)
    return i >= STAGE_ORDER.length - 1 ? null : STAGE_ORDER[i + 1]
}

export function stageLabel(stage: AttendanceStage | null): string {
    return LABELS[stage as AttendanceStage] ?? LABELS.preparing
}

/** 1-based, for the deck's six-segment progress bar. */
export function stageProgress(stage: AttendanceStage | null): number {
    return stageIndex(stage) + 1
}

/**
 * The operation status a stage implies, or null where the stage says nothing
 * about it.
 *
 * These two side effects were previously client-side: the editor fired
 * `GET /api/operations/update?status=…` alongside every stage write, from
 * three separate places (Advance, a segment click, and the tab's own
 * auto-activate tick). That made the status field directly writable by anyone
 * who could advance a stage, which is why it could not be gated separately —
 * and status is exactly the field that needs gating, since setting an
 * operation back to "In Development" silently disables every automation.
 *
 * Deriving it server-side from the stage write leaves one manual writer: the
 * lifecycle override, which requires `operations.overrideLifecycle`.
 *
 * Only these two stages imply a status. Going backwards deliberately does not
 * reset it — that was the previous behaviour too, and undoing a status as a
 * side effect of correcting a stage would be a surprise.
 */
export function statusForStage(stage: AttendanceStage): Operation['status'] | null {
    if (stage === 'op_running') return 'Active'
    if (stage === 'confirmations_open') return 'Completed'
    return null
}
