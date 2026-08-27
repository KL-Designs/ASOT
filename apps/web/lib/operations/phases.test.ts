/**
 * The Schedule tab's phase ribbon renders entirely from `buildRibbon`, so
 * anything the ribbon can draw wrong is decided here. Pure and clock-injected
 * for the same reason schedule.ts is.
 */
import { describe, test, expect } from 'vitest'
import {
    buildPhases, buildRibbon, devCheckGates, rsvpWindow, scheduleProblems,
    fmtDuration, type ScheduleInput,
} from './phases'

const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
    operationDate: new Date('2026-09-12T08:00:00.000Z'),
    rsvpOpenOffsetMins: null,
    rsvpCloseOffsetMins: 90,
    isCampaignOp: false,
    campaignStartDate: null,
    completions: {},
    now: new Date('2026-08-27T04:20:00.000Z'),
    ...over,
})

/** Three days before the op — the default the open control offers. */
const THREE_DAYS = 3 * 24 * 60

describe('devCheckGates', () => {
    test('a single mission gets five gates, 12 to 4 weeks before the op date', () => {
        expect(devCheckGates(input()).map(g => g.weeks)).toEqual([12, 10, 8, 6, 4])
    })

    test('a campaign gets six gates, counted from the campaign start not the op date', () => {
        const gates = devCheckGates(input({
            isCampaignOp: true,
            campaignStartDate: new Date('2026-10-03T08:00:00.000Z'),
        }))
        expect(gates.map(g => g.weeks)).toEqual([16, 12, 10, 8, 6, 4])
        // 4 weeks before the campaign start, not 4 weeks before this op.
        expect(gates[5].dueAt.toISOString()).toBe('2026-09-05T08:00:00.000Z')
    })

    test('due dates step back in whole calendar weeks from the base date', () => {
        const gates = devCheckGates(input())
        expect(gates[0].dueAt.toISOString()).toBe('2026-06-20T08:00:00.000Z')
        expect(gates[4].dueAt.toISOString()).toBe('2026-08-15T08:00:00.000Z')
    })

    test('a gate with a completion reads done even once its due date has passed', () => {
        const gates = devCheckGates(input({
            completions: {
                w12: {
                    completedAt: '2026-06-19T00:00:00.000Z',
                    completedBy: '1',
                    completedByName: 'Cpl. Hayes',
                    reviewerName: 'Cpl. Hayes',
                },
            },
        }))
        expect(gates[0].state).toBe('done')
    })

    test('an uncompleted gate past its due date reads overdue', () => {
        expect(devCheckGates(input())[0].state).toBe('overdue')
    })

    test('an uncompleted gate still in the future reads pending', () => {
        const gates = devCheckGates(input({ now: new Date('2026-06-01T00:00:00.000Z') }))
        expect(gates.every(g => g.state === 'pending')).toBe(true)
    })

    test('no gates without a base date to count back from', () => {
        expect(devCheckGates(input({ operationDate: null }))).toEqual([])
    })
})

describe('rsvpWindow', () => {
    test('both ends are offsets back from the op date, so both follow if it moves', () => {
        const w = rsvpWindow(input({ rsvpOpenOffsetMins: THREE_DAYS }))
        expect(w.opensAt?.toISOString()).toBe('2026-09-09T08:00:00.000Z')
        expect(w.closesAt?.toISOString()).toBe('2026-09-12T06:30:00.000Z')

        // Move the operation a week later; both ends move with it by a week.
        const moved = rsvpWindow(input({
            rsvpOpenOffsetMins: THREE_DAYS,
            operationDate: new Date('2026-09-19T08:00:00.000Z'),
        }))
        expect(moved.opensAt?.toISOString()).toBe('2026-09-16T08:00:00.000Z')
        expect(moved.closesAt?.toISOString()).toBe('2026-09-19T06:30:00.000Z')
    })

    test('duration is the gap between the two offsets', () => {
        const w = rsvpWindow(input({ rsvpOpenOffsetMins: THREE_DAYS }))
        expect(w.durationMs).toBe(2 * 86_400_000 + 22 * 3_600_000 + 30 * 60_000)
        expect(w.inverted).toBe(false)
    })

    test('an unset open offset means nothing opens RSVP on its own', () => {
        const w = rsvpWindow(input({ rsvpOpenOffsetMins: null }))
        expect(w.mode).toBe('unset')
        expect(w.opensAt).toBeNull()
        expect(w.durationMs).toBeNull()
        expect(w.inverted).toBe(false)
    })

    test('opening later than it closes inverts the window', () => {
        // 30 minutes before the op is *after* the 90-minutes-before close.
        const w = rsvpWindow(input({ rsvpOpenOffsetMins: 30 }))
        expect(w.inverted).toBe(true)
        expect(w.durationMs).toBe(-60 * 60_000)
    })

    test('opening exactly when it closes is inverted too — the window is empty', () => {
        expect(rsvpWindow(input({ rsvpOpenOffsetMins: 90 })).inverted).toBe(true)
    })

    test('a negative open offset puts the opening after the operation starts', () => {
        const w = rsvpWindow(input({ rsvpOpenOffsetMins: -60 }))
        expect(w.opensAfterOp).toBe(true)
    })

    test('without an op date neither offset resolves to an instant', () => {
        const w = rsvpWindow(input({ operationDate: null, rsvpOpenOffsetMins: THREE_DAYS }))
        expect(w.opensAt).toBeNull()
        expect(w.closesAt).toBeNull()
        expect(w.durationMs).toBeNull()
        expect(w.inverted).toBe(false)
    })
})

describe('buildPhases', () => {
    const scheduled = () => input({ rsvpOpenOffsetMins: THREE_DAYS })

    test('always five phases, in lifecycle order', () => {
        expect(buildPhases(scheduled()).map(p => p.id)).toEqual([
            'pre_production', 'lead_up', 'rsvp_window', 'final_hour', 'op_confirmation',
        ])
    })

    test('pre-production runs from the first gate to the last', () => {
        const p = buildPhases(scheduled())[0]
        expect(p.startsAt?.toISOString()).toBe('2026-06-20T08:00:00.000Z')
        expect(p.endsAt?.toISOString()).toBe('2026-08-15T08:00:00.000Z')
    })

    test('lead-up bridges the last gate to the RSVP open', () => {
        const p = buildPhases(scheduled())[1]
        expect(p.startsAt?.toISOString()).toBe('2026-08-15T08:00:00.000Z')
        expect(p.endsAt?.toISOString()).toBe('2026-09-09T08:00:00.000Z')
    })

    test('the final hour is the gap between RSVP closing and the operation starting', () => {
        const p = buildPhases(scheduled())[3]
        expect(p.startsAt?.toISOString()).toBe('2026-09-12T06:30:00.000Z')
        expect(p.endsAt?.toISOString()).toBe('2026-09-12T08:00:00.000Z')
        expect(p.durationMs).toBe(90 * 60_000)
    })

    test('phases before now are spent, the one containing now is current, the rest future', () => {
        expect(buildPhases(scheduled()).map(p => p.state))
            .toEqual(['spent', 'current', 'future', 'future', 'future'])
    })

    test('exactly one phase is ever current', () => {
        expect(buildPhases(scheduled()).filter(p => p.state === 'current')).toHaveLength(1)
    })

    test('an inverted RSVP window marks that phase invalid and nothing else', () => {
        const phases = buildPhases(input({ rsvpOpenOffsetMins: 30 }))
        expect(phases.find(p => p.id === 'rsvp_window')!.invalid).toBe(true)
        expect(phases.filter(p => p.invalid).map(p => p.id)).toEqual(['rsvp_window'])
    })

    test('an unset open leaves the window without a start, so lead-up runs to the close', () => {
        const phases = buildPhases(input({ rsvpOpenOffsetMins: null }))
        expect(phases[1].endsAt?.toISOString()).toBe('2026-09-12T06:30:00.000Z')
        expect(phases[2].startsAt).toBeNull()
        expect(phases[2].durationMs).toBeNull()
        expect(phases[2].invalid).toBe(false)
    })

    test('widths are allocated by design and always total 100', () => {
        expect(buildPhases(scheduled()).reduce((n, p) => n + p.widthPct, 0)).toBe(100)
    })
})

describe('scheduleProblems', () => {
    test('a healthy schedule has nothing to report', () => {
        expect(scheduleProblems(input({ rsvpOpenOffsetMins: THREE_DAYS }))).toEqual([])
    })

    test('an unset open is not a problem — it just means nobody scheduled one', () => {
        expect(scheduleProblems(input({ rsvpOpenOffsetMins: null }))).toEqual([])
    })

    test('an inverted window is critical and blocks publishing', () => {
        const [p, ...rest] = scheduleProblems(input({ rsvpOpenOffsetMins: 30 }))
        expect(p.id).toBe('rsvp_inverted')
        expect(p.severity).toBe('critical')
        expect(p.blocksPublish).toBe(true)
        expect(rest).toEqual([])
    })

    test('an inverted window offers opening three days before the op as the fix', () => {
        const [p] = scheduleProblems(input({ rsvpOpenOffsetMins: 30 }))
        expect(p.fix).toEqual({ label: 'Open 3 days before', minutesBeforeOp: THREE_DAYS })
    })

    test('a negative open offset is reported as opening after the operation', () => {
        expect(scheduleProblems(input({ rsvpOpenOffsetMins: -60 })).map(p => p.id))
            .toEqual(['rsvp_after_op'])
    })

    test('no operation date is a warning, because nothing can be scheduled without one', () => {
        const [p] = scheduleProblems(input({ operationDate: null }))
        expect(p.id).toBe('no_operation_date')
        expect(p.severity).toBe('warning')
        expect(p.blocksPublish).toBe(true)
    })
})

describe('fmtDuration', () => {
    const days = (n: number) => n * 86_400_000

    test('long spans read in weeks, to the nearest half', () => {
        expect(fmtDuration(days(84))).toBe('12 weeks')
        expect(fmtDuration(days(25))).toBe('3½ weeks')
    })

    test('a fortnight or less reads in days and hours', () => {
        expect(fmtDuration(days(2) + 22 * 3_600_000 + 30 * 60_000)).toBe('2d 22h')
    })

    test('whole days drop the empty hour', () => {
        expect(fmtDuration(days(1))).toBe('1d')
    })

    test('under a day reads in hours and minutes', () => {
        expect(fmtDuration(90 * 60_000)).toBe('1h 30m')
        expect(fmtDuration(45 * 60_000)).toBe('45m')
    })

    test('a negative span reads in days, because it is a diagnostic and not a schedule', () => {
        expect(fmtDuration(-days(46))).toBe('−46 days')
    })

    test('an unknown span has no label to give', () => {
        expect(fmtDuration(null)).toBe('—')
    })
})

describe('buildRibbon', () => {
    const scheduled = (over: Partial<ScheduleInput> = {}) =>
        input({ rsvpOpenOffsetMins: THREE_DAYS, ...over })

    test('boundaries run first gate, last gate, opens, closes, op, completed', () => {
        expect(buildRibbon(scheduled()).boundaries.map(b => b.id)).toEqual([
            'first_gate', 'last_gate', 'rsvp_opens', 'rsvp_closes', 'op_starts', 'completed',
        ])
    })

    test('boundary positions accumulate the phase widths across the whole ribbon', () => {
        expect(buildRibbon(scheduled()).boundaries.map(b => b.atPct))
            .toEqual([0, 25, 46, 67, 80, 100])
    })

    test('gate boundaries are labelled by week, so a campaign opens at W16 not W12', () => {
        expect(buildRibbon(scheduled()).boundaries[0].label).toBe('W12 · first gate')
        expect(buildRibbon(scheduled({
            isCampaignOp: true,
            campaignStartDate: new Date('2026-10-03T08:00:00.000Z'),
        })).boundaries[0].label).toBe('W16 · first gate')
    })

    test('the operation is the anchor boundary', () => {
        expect(buildRibbon(scheduled()).boundaries.find(b => b.id === 'op_starts')!.kind).toBe('anchor')
    })

    test('an inverted window marks its open boundary invalid', () => {
        const r = buildRibbon(input({ rsvpOpenOffsetMins: 30 }))
        expect(r.boundaries.find(b => b.id === 'rsvp_opens')!.state).toBe('invalid')
    })

    test('only the gates between the first and last hang inside pre-production', () => {
        const ms = buildRibbon(scheduled()).milestones.filter(m => m.phaseId === 'pre_production')
        expect(ms.map(m => m.label)).toEqual(['W10', 'W8', 'W6'])
    })

    test('interior gates are spaced across their phase by their real due dates', () => {
        const ms = buildRibbon(scheduled()).milestones.filter(m => m.phaseId === 'pre_production')
        expect(ms.map(m => Math.round(m.offsetPct))).toEqual([25, 50, 75])
    })

    test('a requested orders check hangs in the phase its date falls in', () => {
        const oc = buildRibbon(scheduled({ ordersCheckAt: new Date('2026-09-01T08:00:00.000Z') }))
            .milestones.find(m => m.id === 'orders_check')!
        expect(oc.phaseId).toBe('lead_up')
        expect(oc.state).toBe('pending')
    })

    test('an unrequested orders check still shows, as a ghost in the lead-up', () => {
        const oc = buildRibbon(scheduled()).milestones.find(m => m.id === 'orders_check')!
        expect(oc.state).toBe('ghost')
        expect(oc.phaseId).toBe('lead_up')
    })

    test('the now line sits proportionally inside whichever phase contains it', () => {
        // 27 Aug is 12 days into the 25-day lead-up, which starts at 25%.
        expect(Math.round(buildRibbon(scheduled()).nowPct)).toBe(35)
    })

    test('the now line pins to the end once the whole schedule is behind us', () => {
        expect(buildRibbon(scheduled({ now: new Date('2027-01-01T00:00:00.000Z') })).nowPct).toBe(100)
    })

    test('the now line pins to the start before the schedule begins', () => {
        expect(buildRibbon(scheduled({ now: new Date('2026-01-01T00:00:00.000Z') })).nowPct).toBe(0)
    })
})
