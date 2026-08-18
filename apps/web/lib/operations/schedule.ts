/**
 * Everything the editor deck and the public status bar need to say *when*
 * something happens. Pure functions; `now` is passed in wherever it's needed
 * (fmtCountdown) so the timeline is testable without faking timers.
 *
 * Lifted from components/operations/OperationStatusBar.tsx, which computed all
 * of this inline and is now a consumer.
 */

import { STAGE_ORDER, stageIndex, type AttendanceStage } from './stage'

export type { AttendanceStage }

/** The `GET /api/operations/[id]/live-status` response. */
export interface LiveStatus {
    operationStatus: string | null
    operationDate: string | null
    rsvpOpen: boolean
    rsvpOpenAt: string | null
    rsvpCloseOffsetMins: number
    confirmationOpen: boolean
    confirmationOpenedAt: string | null
    stage: AttendanceStage | null
}

export type MomentId =
    | 'rsvp_opens' | 'rsvp_closes' | 'op_starts'
    | 'confirmations_open' | 'completed'

export interface TimelineMoment {
    id: MomentId
    label: string
    /** null when the moment has no computable time — a manual RSVP, or no op date yet. */
    at: Date | null
    /** One human sentence for the row: a formatted date, 'Manual', or a rule. */
    detail: string
    state: 'done' | 'current' | 'pending'
}

/** Confirmations stay open for a day. 24h, not 48 — see OperationStatusBar. */
const CONFIRMATION_WINDOW_MS = 24 * 3600_000

export function fmtCountdown(target: Date, now: Date): string | null {
    const diff = target.getTime() - now.getTime()
    if (diff <= 0) return null
    const s = Math.floor(diff / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    return `${m}m ${s % 60}s`
}

export function rsvpCloseAt(operationDate: Date | null, offsetMins: number): Date | null {
    if (!operationDate) return null
    return new Date(operationDate.getTime() - offsetMins * 60_000)
}

const STAGE_BY_MOMENT: Record<MomentId, AttendanceStage> = {
    rsvp_opens: 'rsvp_open',
    rsvp_closes: 'rsvp_closed',
    op_starts: 'op_running',
    confirmations_open: 'confirmations_open',
    completed: 'completed',
}

function stateFor(moment: MomentId, stage: AttendanceStage | null): TimelineMoment['state'] {
    const current = stageIndex(stage)
    const mine = STAGE_ORDER.indexOf(STAGE_BY_MOMENT[moment])
    if (mine < current) return 'done'
    if (mine === current) return 'current'
    return 'pending'
}

function fmtAt(at: Date | null): string {
    if (!at) return '—'
    return at.toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })
}

export function buildTimeline(status: LiveStatus): TimelineMoment[] {
    const opDate = status.operationDate ? new Date(status.operationDate) : null
    const openAt = status.rsvpOpenAt ? new Date(status.rsvpOpenAt) : null
    const closeAt = rsvpCloseAt(opDate, status.rsvpCloseOffsetMins)
    const confirmedAt = status.confirmationOpenedAt ? new Date(status.confirmationOpenedAt) : null
    const completedAt = confirmedAt ? new Date(confirmedAt.getTime() + CONFIRMATION_WINDOW_MS) : null

    return [
        {
            id: 'rsvp_opens',
            label: 'RSVP opens',
            at: openAt,
            detail: openAt ? fmtAt(openAt) : 'Manual',
            state: stateFor('rsvp_opens', status.stage),
        },
        {
            id: 'rsvp_closes',
            label: 'RSVP closes',
            at: closeAt,
            detail: closeAt ? fmtAt(closeAt) : '—',
            state: stateFor('rsvp_closes', status.stage),
        },
        {
            id: 'op_starts',
            label: 'Operation starts',
            at: opDate,
            detail: opDate ? fmtAt(opDate) : 'No date set',
            state: stateFor('op_starts', status.stage),
        },
        {
            id: 'confirmations_open',
            label: 'Confirmations open',
            at: null,
            detail: 'When the mission ends',
            state: stateFor('confirmations_open', status.stage),
        },
        {
            id: 'completed',
            label: 'Completed',
            at: completedAt,
            detail: completedAt ? fmtAt(completedAt) : '24 hours after confirmations open',
            state: stateFor('completed', status.stage),
        },
    ]
}
