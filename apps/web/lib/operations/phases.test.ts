/**
 * The Schedule tab's phase ribbon renders entirely from `buildSchedule`, so
 * anything the ribbon can draw wrong is decided here. Pure and clock-injected
 * for the same reason schedule.ts is.
 */
import { describe, test, expect } from 'vitest'
import { buildPhases, devCheckGates, rsvpWindow, scheduleProblems, fmtDuration, type ScheduleInput } from './phases'

const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
    operationDate: new Date('2026-09-12T08:00:00.000Z'),
    rsvpOpenAt: null,
    rsvpCloseOffsetMins: 90,
    isCampaignOp: false,
    campaignStartDate: null,
    completions: {},
    now: new Date('2026-08-27T04:20:00.000Z'),
    ...over,
})

describe('devCheckGates', () => {
    test('a single mission gets five gates, 12 to 4 weeks before the op date', () => {
        const gates = devCheckGates(input())
        expect(gates.map(g => g.weeks)).toEqual([12, 10, 8, 6, 4])
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
    test('a scheduled window spans its open instant to the close offset before the op', () => {
        const w = rsvpWindow(input({ rsvpOpenAt: new Date('2026-09-09T08:00:00.000Z') }))
        expect(w.mode).toBe('scheduled')
        expect(w.opensAt?.toISOString()).toBe('2026-09-09T08:00:00.000Z')
        expect(w.closesAt?.toISOString()).toBe('2026-09-12T06:30:00.000Z')
        expect(w.inverted).toBe(false)
    })

    test('duration is the distance between the two ends', () => {
        const w = rsvpWindow(input({ rsvpOpenAt: new Date('2026-09-09T08:00:00.000Z') }))
        expect(w.durationMs).toBe(2 * 86_400_000 + 22 * 3_600_000 + 30 * 60_000)
    })

    test('a manual window has no open instant and cannot be inverted', () => {
        const w = rsvpWindow(input({ rsvpOpenAt: null }))
        expect(w.mode).toBe('manual')
        expect(w.opensAt).toBeNull()
        expect(w.durationMs).toBeNull()
        expect(w.inverted).toBe(false)
    })

    test('an open instant later than the close instant inverts the window', () => {
        const w = rsvpWindow(input({ rsvpOpenAt: new Date('2026-10-28T08:00:00.000Z') }))
        expect(w.inverted).toBe(true)
        expect(w.durationMs).toBeLessThan(0)
    })

    test('a window opening after the operation starts is flagged separately', () => {
        // Opens 30 minutes after the op, which is still before RSVP would close
        // in a nonsense config — so this must not rely on the inverted check.
        const w = rsvpWindow(input({
            rsvpOpenAt: new Date('2026-09-12T08:30:00.000Z'),
            rsvpCloseOffsetMins: -120,
        }))
        expect(w.inverted).toBe(false)
        expect(w.opensAfterOp).toBe(true)
    })

    test('without an op date there is nothing to measure the close against', () => {
        const w = rsvpWindow(input({ operationDate: null, rsvpOpenAt: new Date('2026-09-09T08:00:00.000Z') }))
        expect(w.closesAt).toBeNull()
        expect(w.durationMs).toBeNull()
        expect(w.inverted).toBe(false)
    })
})

describe('buildPhases', () => {
    const scheduled = () => input({ rsvpOpenAt: new Date('2026-09-09T08:00:00.000Z') })

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
        const states = buildPhases(scheduled()).map(p => p.state)
        expect(states).toEqual(['spent', 'current', 'future', 'future', 'future'])
    })

    test('exactly one phase is ever current', () => {
        const phases = buildPhases(scheduled())
        expect(phases.filter(p => p.state === 'current')).toHaveLength(1)
    })

    test('an inverted RSVP window marks that phase invalid and nothing else', () => {
        const phases = buildPhases(input({ rsvpOpenAt: new Date('2026-10-28T08:00:00.000Z') }))
        const rsvp = phases.find(p => p.id === 'rsvp_window')!
        expect(rsvp.invalid).toBe(true)
        expect(phases.filter(p => p.invalid).map(p => p.id)).toEqual(['rsvp_window'])
    })

    test('a manual RSVP window has no start, so lead-up runs to the close instead', () => {
        const phases = buildPhases(input({ rsvpOpenAt: null }))
        expect(phases[1].endsAt?.toISOString()).toBe('2026-09-12T06:30:00.000Z')
        expect(phases[2].startsAt).toBeNull()
        expect(phases[2].durationMs).toBeNull()
        expect(phases[2].invalid).toBe(false)
    })

    test('widths are allocated by design and always total 100', () => {
        const total = buildPhases(scheduled()).reduce((n, p) => n + p.widthPct, 0)
        expect(total).toBe(100)
    })
})

describe('scheduleProblems', () => {
    test('a healthy schedule has nothing to report', () => {
        expect(scheduleProblems(input({ rsvpOpenAt: new Date('2026-09-09T08:00:00.000Z') }))).toEqual([])
    })

    test('a manual RSVP window is a choice, not a problem', () => {
        expect(scheduleProblems(input({ rsvpOpenAt: null }))).toEqual([])
    })

    test('an inverted window is critical and blocks publishing', () => {
        const [p, ...rest] = scheduleProblems(input({ rsvpOpenAt: new Date('2026-10-28T08:00:00.000Z') }))
        expect(p.id).toBe('rsvp_inverted')
        expect(p.severity).toBe('critical')
        expect(p.blocksPublish).toBe(true)
        expect(rest).toEqual([])
    })

    test('an inverted window offers opening three days before the op as the fix', () => {
        const [p] = scheduleProblems(input({ rsvpOpenAt: new Date('2026-10-28T08:00:00.000Z') }))
        expect(p.fix).toEqual({ label: 'Open 3 days before', minutesBeforeOp: 4320 })
    })

    test('opening after the op is reported on its own when the window is not inverted', () => {
        const problems = scheduleProblems(input({
            rsvpOpenAt: new Date('2026-09-12T08:30:00.000Z'),
            rsvpCloseOffsetMins: -120,
        }))
        expect(problems.map(p => p.id)).toEqual(['rsvp_after_op'])
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
