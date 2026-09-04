/**
 * The schedule model behind the Schedule tab's phase ribbon.
 *
 * One operation has one life, from the first development gate to twenty-four
 * hours after the mission ends. The old tab drew that life three times — a
 * gate rail, five RSVP columns and six stage segments — in three idioms that
 * never said they were the same line. This module computes it once, as an
 * ordered run of *phases* rather than a scatter of instants, which is what
 * makes an out-of-order schedule structurally visible: phases are adjacent by
 * construction, so a bad RSVP-open date produces a phase with negative
 * duration instead of a marker that merely sits somewhere surprising.
 *
 * Pure and clock-injected throughout — `now` is a parameter, never read here —
 * for the same reason schedule.ts is: the ribbon is testable without faking
 * timers, and the editor and any server-side caller agree by construction.
 */

/** Gate week offsets by operation kind — the same two lists the server uses. */
const CAMPAIGN_GATE_WEEKS = [16, 12, 10, 8, 6, 4] as const
const SINGLE_GATE_WEEKS = [12, 10, 8, 6, 4] as const

export interface ScheduleInput {
    /** Committed operation date — the anchor every other instant derives from. */
    operationDate: Date | null
    /**
     * Committed RSVP-open lead time, in minutes before the operation date —
     * the mirror of `rsvpCloseOffsetMins`. null means no automatic open has
     * been scheduled; RSVP then only opens when someone advances the stage.
     */
    rsvpOpenOffsetMins: number | null
    /** Committed RSVP-close lead time, in minutes before the operation date. */
    rsvpCloseOffsetMins: number
    isCampaignOp: boolean
    /** Campaign start — gates count back from this instead of the op date. */
    campaignStartDate: Date | null
    completions: Record<string, MissionDevCompletion | undefined>
    /** Confirmed or requested orders-check time, if there is an active request. */
    ordersCheckAt?: Date | null
    now: Date
}

export interface DevCheckGate {
    /** Storage key — 'w12', 'w4'. Matches missionDevelopment.completions. */
    id: string
    /** Display label — 'W12'. */
    label: string
    weeks: number
    dueAt: Date
    state: 'done' | 'overdue' | 'pending'
    completion?: MissionDevCompletion
}

/**
 * Gates step back in whole *calendar* weeks, not in fixed milliseconds.
 *
 * This is deliberate and is a behaviour change from the panel it replaces.
 * PreProductionPanel subtracted `weeks * 7 * 24 * 3600000`, while both server
 * consumers — `api/j2/dev-checks` and `api/cron/dev-check-escalation` — step
 * with `setDate()`. Across a DST boundary those disagree by an hour, so the
 * editor could show a gate as due at a different time than the task the cron
 * escalates against. Calendar stepping matches the side that creates the
 * tasks, so the two now agree.
 */
function gateDueDate(base: Date, weeks: number): Date {
    const d = new Date(base)
    d.setDate(d.getDate() - weeks * 7)
    return d
}

/** The base date gates count back from: campaign start if there is one, else the op date. */
export function gateBaseDate(input: ScheduleInput): Date | null {
    if (input.isCampaignOp && input.campaignStartDate) return input.campaignStartDate
    return input.operationDate
}

export function devCheckGates(input: ScheduleInput): DevCheckGate[] {
    const base = gateBaseDate(input)
    if (!base) return []

    const weeksList = input.isCampaignOp ? CAMPAIGN_GATE_WEEKS : SINGLE_GATE_WEEKS

    return weeksList.map(weeks => {
        const id = `w${weeks}`
        const completion = input.completions[id]
        const dueAt = gateDueDate(base, weeks)
        return {
            id,
            label: `W${weeks}`,
            weeks,
            dueAt,
            state: completion ? 'done' : input.now > dueAt ? 'overdue' : 'pending',
            completion,
        }
    })
}

export interface RsvpWindow {
    /** 'unset' means no automatic open is scheduled — only Advance opens it. */
    mode: 'unset' | 'scheduled'
    opensAt: Date | null
    closesAt: Date | null
    /** Negative when the window is inverted; null when either end is unknown. */
    durationMs: number | null
    /** The window closes before it opens — it could never be open at all. */
    inverted: boolean
    /** The window opens after the operation has already started. */
    opensAfterOp: boolean
}

/**
 * RSVP treated as one object rather than two unrelated instants.
 *
 * Both ends are now lead times measured back from the operation date. They
 * used to be stored asymmetrically — open an absolute instant, close an offset
 * — which is why they were edited as two unrelated rows, why one could drift
 * past the other unnoticed, and why moving the operation moved only one of
 * them. As two offsets the window is a single object that follows its anchor,
 * and ordering is just a comparison of two numbers.
 *
 * Note the direction: a *larger* offset is *earlier*, so a valid window has
 * `open > close`. An empty window (equal offsets) counts as inverted — it
 * would open and close in the same instant, which is not a window.
 */
export function rsvpWindow(input: ScheduleInput): RsvpWindow {
    const { operationDate, rsvpOpenOffsetMins, rsvpCloseOffsetMins } = input

    const at = (offsetMins: number) =>
        new Date(operationDate!.getTime() - offsetMins * 60_000)

    const closesAt = operationDate ? at(rsvpCloseOffsetMins) : null
    const opensAt = operationDate && rsvpOpenOffsetMins !== null ? at(rsvpOpenOffsetMins) : null

    const durationMs = opensAt && closesAt ? closesAt.getTime() - opensAt.getTime() : null

    return {
        mode: rsvpOpenOffsetMins === null ? 'unset' : 'scheduled',
        opensAt,
        closesAt,
        durationMs,
        inverted: rsvpOpenOffsetMins !== null && rsvpOpenOffsetMins <= rsvpCloseOffsetMins,
        opensAfterOp: rsvpOpenOffsetMins !== null && rsvpOpenOffsetMins < 0,
    }
}

export type PhaseId =
    | 'pre_production' | 'lead_up' | 'rsvp_window' | 'final_hour' | 'op_confirmation'

export interface Phase {
    id: PhaseId
    label: string
    startsAt: Date | null
    endsAt: Date | null
    /** null when either end is unknown — a manual RSVP window, or no op date. */
    durationMs: number | null
    /**
     * 'unknown' is not a fourth position on the timeline; it means this phase's
     * bounds aren't known well enough to place `now` against them.
     */
    state: 'spent' | 'current' | 'future' | 'unknown'
    /** Ends before it starts. Only ever true of a phase whose ends are set independently. */
    invalid: boolean
    /** Share of the ribbon's width. Allocation, not scale — see PHASE_WIDTHS. */
    widthPct: number
}

/**
 * How much of the ribbon each phase gets.
 *
 * This is allocation, not scale, and that is the whole point: pre-production
 * is twelve weeks and the final hour is ninety minutes, so drawing them to a
 * shared scale makes one of them invisible. Each phase instead states its real
 * duration in its own label, which is why no "spacing is not linear"
 * disclaimer is needed — nothing here claims to be linear.
 */
export const PHASE_WIDTHS: Record<PhaseId, number> = {
    pre_production: 25,
    lead_up: 21,
    rsvp_window: 21,
    final_hour: 13,
    op_confirmation: 20,
}

const PHASE_LABELS: Record<PhaseId, string> = {
    pre_production: 'Pre-production',
    lead_up: 'Lead-up',
    rsvp_window: 'Sign-up window',
    final_hour: 'Final hour',
    op_confirmation: 'Op & confirmation',
}

/** Confirmations stay open for a day — the same 24h the cron closes them after. */
const CONFIRMATION_WINDOW_MS = 24 * 3_600_000

function phaseState(startsAt: Date | null, endsAt: Date | null, now: Date): Phase['state'] {
    if (endsAt && endsAt <= now) return 'spent'
    if (startsAt && startsAt <= now) return 'current'
    if (startsAt && startsAt > now) return 'future'
    return 'unknown'
}

function makePhase(id: PhaseId, startsAt: Date | null, endsAt: Date | null, now: Date): Phase {
    const durationMs = startsAt && endsAt ? endsAt.getTime() - startsAt.getTime() : null
    return {
        id,
        label: PHASE_LABELS[id],
        startsAt,
        endsAt,
        durationMs,
        state: phaseState(startsAt, endsAt, now),
        invalid: durationMs !== null && durationMs < 0,
        widthPct: PHASE_WIDTHS[id],
    }
}

/**
 * The operation's life as five adjacent phases.
 *
 * Adjacency is the load-bearing property. Each phase ends where the next
 * begins, so a boundary set out of order cannot merely look odd — it gives its
 * phase a negative duration, which is a shape the ribbon cannot draw. That is
 * how an RSVP window set to open after the operation is caught: not by a
 * validator noticing, but by the geometry failing.
 */
export function buildPhases(input: ScheduleInput): Phase[] {
    const { operationDate, now } = input
    const gates = devCheckGates(input)
    const window = rsvpWindow(input)

    const firstGateAt = gates[0]?.dueAt ?? null
    const lastGateAt = gates[gates.length - 1]?.dueAt ?? null

    // A manual window has no start, so lead-up runs to the next instant that is
    // actually known — the close — rather than dead-ending at nothing.
    const leadUpEndsAt = window.opensAt ?? window.closesAt

    const completedAt = operationDate
        ? new Date(operationDate.getTime() + CONFIRMATION_WINDOW_MS)
        : null

    return [
        makePhase('pre_production', firstGateAt, lastGateAt, now),
        makePhase('lead_up', lastGateAt, leadUpEndsAt, now),
        makePhase('rsvp_window', window.opensAt, window.closesAt, now),
        makePhase('final_hour', window.closesAt, operationDate, now),
        makePhase('op_confirmation', operationDate, completedAt, now),
    ]
}

export interface ScheduleProblem {
    id: 'rsvp_inverted' | 'rsvp_after_op' | 'no_operation_date'
    severity: 'critical' | 'warning'
    message: string
    /**
     * A one-click remedy, expressed as intent rather than a handler so this
     * module stays pure and the caller decides how to apply it.
     */
    fix?: { label: string; minutesBeforeOp: number }
    /**
     * Publishing resumes every automation the ribbon describes, so a schedule
     * that cannot execute must not be publishable — a paused bad schedule is
     * harmless, a live one silently never opens RSVP.
     */
    blocksPublish: boolean
}

/** The default the "Scheduled" pill has always used: three days before the op. */
const DEFAULT_OPEN_LEAD_MINS = 3 * 24 * 60

const OPEN_THREE_DAYS_BEFORE = {
    label: 'Open 3 days before',
    minutesBeforeOp: DEFAULT_OPEN_LEAD_MINS,
} as const

export function scheduleProblems(input: ScheduleInput): ScheduleProblem[] {
    const problems: ScheduleProblem[] = []

    if (!input.operationDate) {
        problems.push({
            id: 'no_operation_date',
            severity: 'warning',
            message: 'Set an operation date. Every gate and both sign-up boundaries are measured from it.',
            blocksPublish: true,
        })
        return problems
    }

    const window = rsvpWindow(input)

    if (window.opensAfterOp) {
        // Checked first: a negative offset is also technically inverted, but
        // "opens after the operation starts" names the mistake precisely,
        // where "inverted" only says the two ends are the wrong way round.
        problems.push({
            id: 'rsvp_after_op',
            severity: 'critical',
            message: 'Sign-ups are set to open after the operation starts.',
            fix: OPEN_THREE_DAYS_BEFORE,
            blocksPublish: true,
        })
    } else if (window.inverted) {
        problems.push({
            id: 'rsvp_inverted',
            severity: 'critical',
            message: 'Sign-ups are set to open after they close, so they would never open.',
            fix: OPEN_THREE_DAYS_BEFORE,
            blocksPublish: true,
        })
    }

    return problems
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MIN_MS = 60_000

/**
 * The duration each phase prints in its own label — the thing that lets the
 * ribbon allocate width rather than scale it and still tell the truth.
 *
 * A negative span always reads in days. It is a diagnostic, not a schedule,
 * and "−46 days" is read at a glance in a way "minus 6½ weeks" is not.
 */
export function fmtDuration(ms: number | null): string {
    if (ms === null) return '—'
    if (ms < 0) return `−${Math.round(-ms / DAY_MS)} days`

    if (ms >= 14 * DAY_MS) {
        const weeks = Math.round((ms / DAY_MS / 7) * 2) / 2
        const whole = Math.floor(weeks)
        return `${weeks % 1 ? `${whole || ''}½` : whole} weeks`
    }

    if (ms >= DAY_MS) {
        const d = Math.floor(ms / DAY_MS)
        const h = Math.floor((ms % DAY_MS) / HOUR_MS)
        return h ? `${d}d ${h}h` : `${d}d`
    }

    const h = Math.floor(ms / HOUR_MS)
    const m = Math.floor((ms % HOUR_MS) / MIN_MS)
    return h ? `${h}h ${m}m` : `${m}m`
}

export interface Boundary {
    id: 'first_gate' | 'last_gate' | 'rsvp_opens' | 'rsvp_closes' | 'op_starts' | 'completed'
    label: string
    at: Date | null
    /** 'anchor' is the operation itself — the instant everything else derives from. */
    kind: 'gate' | 'transition' | 'anchor'
    state: 'done' | 'overdue' | 'pending' | 'invalid'
    /** Absolute position across the whole ribbon, 0–100. */
    atPct: number
}

export interface Milestone {
    id: string
    label: string
    detail: string
    at: Date | null
    phaseId: PhaseId
    /** Position within its own phase, 0–100. */
    offsetPct: number
    /** 'ghost' is a milestone that has not been scheduled but is worth a slot. */
    state: 'done' | 'overdue' | 'pending' | 'ghost'
}

export interface Ribbon {
    phases: Phase[]
    boundaries: Boundary[]
    milestones: Milestone[]
    gates: DevCheckGate[]
    window: RsvpWindow
    problems: ScheduleProblem[]
    /** Where the now line falls across the whole ribbon, 0–100. */
    nowPct: number
}

/** Cumulative left edge of each phase, in ribbon percent. */
export function phaseOffsets(phases: Phase[]): number[] {
    const offsets: number[] = []
    let acc = 0
    for (const p of phases) {
        offsets.push(acc)
        acc += p.widthPct
    }
    return offsets
}

/** Where an instant falls inside a phase, 0–100, clamped to the phase. */
function offsetWithin(phase: Phase, at: Date): number {
    if (!phase.startsAt || !phase.endsAt) return 0
    const span = phase.endsAt.getTime() - phase.startsAt.getTime()
    if (span <= 0) return 0
    const frac = (at.getTime() - phase.startsAt.getTime()) / span
    return Math.max(0, Math.min(100, frac * 100))
}

function instantState(at: Date | null, now: Date): Boundary['state'] {
    if (!at) return 'pending'
    return at <= now ? 'done' : 'pending'
}

/**
 * Everything the ribbon draws, in one pass.
 *
 * The component that renders this owns no schedule logic at all — it maps
 * percentages onto CSS. Keeping the geometry here is what lets the ordering
 * rules be tested without a browser.
 */
export function buildRibbon(input: ScheduleInput): Ribbon {
    const { now } = input
    const phases = buildPhases(input)
    const gates = devCheckGates(input)
    const window = rsvpWindow(input)
    const problems = scheduleProblems(input)
    const offsets = phaseOffsets(phases)

    const firstGate = gates[0]
    const lastGate = gates[gates.length - 1]

    const openInvalid = window.inverted || window.opensAfterOp

    const boundaries: Boundary[] = [
        {
            id: 'first_gate',
            label: firstGate ? `${firstGate.label} · first gate` : 'First gate',
            at: firstGate?.dueAt ?? null,
            kind: 'gate',
            state: firstGate?.state ?? 'pending',
            atPct: offsets[0],
        },
        {
            id: 'last_gate',
            label: lastGate ? `${lastGate.label} · last gate` : 'Last gate',
            at: lastGate?.dueAt ?? null,
            kind: 'gate',
            state: lastGate?.state ?? 'pending',
            atPct: offsets[1],
        },
        {
            id: 'rsvp_opens',
            label: window.mode === 'unset' ? 'Sign-ups open · not set' : 'Sign-ups open',
            at: window.opensAt,
            kind: 'transition',
            state: openInvalid ? 'invalid' : instantState(window.opensAt, now),
            atPct: offsets[2],
        },
        {
            id: 'rsvp_closes',
            label: 'Sign-ups close',
            at: window.closesAt,
            kind: 'transition',
            state: instantState(window.closesAt, now),
            atPct: offsets[3],
        },
        {
            id: 'op_starts',
            label: 'Op starts',
            at: input.operationDate,
            kind: 'anchor',
            state: instantState(input.operationDate, now),
            atPct: offsets[4],
        },
        {
            id: 'completed',
            label: 'Completed',
            at: phases[4].endsAt,
            kind: 'transition',
            state: instantState(phases[4].endsAt, now),
            atPct: 100,
        },
    ]

    const preProduction = phases[0]
    const milestones: Milestone[] = gates.slice(1, -1).map(g => ({
        id: g.id,
        label: g.label,
        detail: g.completion ? `signed off by ${g.completion.reviewerName}` : fmtGateDate(g.dueAt),
        at: g.dueAt,
        phaseId: 'pre_production' as PhaseId,
        offsetPct: offsetWithin(preProduction, g.dueAt),
        state: g.state,
    }))

    // The orders check keeps a slot even when nobody has asked for one — its
    // absence is the thing a mission maker most often needs reminding of.
    const ordersCheckAt = input.ordersCheckAt ?? null
    const ordersPhase = ordersCheckAt
        ? phases.find(p => p.startsAt && p.endsAt && ordersCheckAt >= p.startsAt && ordersCheckAt < p.endsAt)
        : undefined
    milestones.push({
        id: 'orders_check',
        label: 'Orders check',
        detail: ordersCheckAt ? fmtGateDate(ordersCheckAt) : 'not requested',
        at: ordersCheckAt,
        phaseId: ordersPhase?.id ?? 'lead_up',
        offsetPct: ordersCheckAt && ordersPhase ? offsetWithin(ordersPhase, ordersCheckAt) : 80,
        state: ordersCheckAt ? (ordersCheckAt <= now ? 'done' : 'pending') : 'ghost',
    })

    milestones.push({
        id: 'mission_ends',
        label: 'Mission ends',
        detail: 'confirmations open',
        at: null,
        phaseId: 'op_confirmation',
        offsetPct: 15,
        state: 'pending',
    })

    return { phases, boundaries, milestones, gates, window, problems, nowPct: nowPosition(phases, offsets, now) }
}

function fmtGateDate(d: Date): string {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/**
 * The now line pins to an end rather than disappearing when it falls outside
 * the drawn range — an operation whose whole schedule is behind it should read
 * as finished, not as having no present at all.
 */
function nowPosition(phases: Phase[], offsets: number[], now: Date): number {
    const currentIdx = phases.findIndex(p => p.state === 'current')
    if (currentIdx >= 0) {
        const p = phases[currentIdx]
        return offsets[currentIdx] + (offsetWithin(p, now) / 100) * p.widthPct
    }
    const firstStart = phases.find(p => p.startsAt)?.startsAt
    if (firstStart && now < firstStart) return 0
    return phases.some(p => p.state === 'spent') ? 100 : 0
}
