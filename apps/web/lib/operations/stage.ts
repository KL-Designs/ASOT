export type AttendanceStage =
    | 'preparing' | 'rsvp_open' | 'rsvp_closed'
    | 'op_running' | 'confirmations_open' | 'completed'

export const STAGE_ORDER = [
    'preparing', 'rsvp_open', 'rsvp_closed',
    'op_running', 'confirmations_open', 'completed',
] as const satisfies readonly AttendanceStage[]

const LABELS: Record<AttendanceStage, string> = {
    preparing: 'Preparing',
    rsvp_open: 'RSVP Open',
    rsvp_closed: 'RSVP Closed',
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
