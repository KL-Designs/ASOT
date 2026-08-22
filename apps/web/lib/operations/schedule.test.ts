/**
 * The editor's deck and the public status bar both render from these, so a
 * disagreement between them is a bug users see as "the page says two things".
 * All of it is pure and clock-injected, so it is tested directly.
 */
import { describe, test, expect } from 'vitest'
import { fmtCountdown, rsvpCloseAt, buildTimeline, type LiveStatus } from './schedule'

const base: LiveStatus = {
    operationStatus: 'Upcoming',
    operationDate: '2026-11-18T08:00:00.000Z',
    rsvpOpen: false,
    rsvpOpenAt: null,
    rsvpCloseOffsetMins: 90,
    confirmationOpen: false,
    confirmationOpenedAt: null,
    stage: 'preparing',
}

describe('fmtCountdown', () => {
    const now = new Date('2026-08-18T00:00:00.000Z')

    test('days and hours when more than a day out', () => {
        expect(fmtCountdown(new Date('2026-08-20T05:00:00.000Z'), now)).toBe('2d 5h')
    })

    test('hours and minutes inside a day', () => {
        expect(fmtCountdown(new Date('2026-08-18T03:30:00.000Z'), now)).toBe('3h 30m')
    })

    test('minutes and seconds inside an hour', () => {
        expect(fmtCountdown(new Date('2026-08-18T00:02:05.000Z'), now)).toBe('2m 5s')
    })

    test('null once the target has passed, so callers can branch on it', () => {
        expect(fmtCountdown(new Date('2026-08-17T23:59:59.000Z'), now)).toBeNull()
        expect(fmtCountdown(now, now)).toBeNull()
    })
})

describe('rsvpCloseAt', () => {
    test('subtracts the offset from the operation date', () => {
        expect(rsvpCloseAt(new Date('2026-11-18T08:00:00.000Z'), 90))
            .toEqual(new Date('2026-11-18T06:30:00.000Z'))
    })

    test('null when the operation has no date yet', () => {
        expect(rsvpCloseAt(null, 90)).toBeNull()
    })
})

describe('buildTimeline', () => {
    test('returns the five moments in chronological order', () => {
        expect(buildTimeline(base).map(m => m.id)).toEqual([
            'rsvp_opens', 'rsvp_closes', 'op_starts', 'confirmations_open', 'completed',
        ])
    })

    test('reports a manual RSVP as Manual rather than inventing a time', () => {
        const m = buildTimeline(base)[0]
        expect(m.at).toBeNull()
        expect(m.detail).toBe('Manual')
    })

    test('uses the scheduled open time when one is set', () => {
        const m = buildTimeline({ ...base, rsvpOpenAt: '2026-11-17T08:00:00.000Z' })[0]
        expect(m.at).toEqual(new Date('2026-11-17T08:00:00.000Z'))
    })

    test('marks the operation start as current once running', () => {
        const t = buildTimeline({ ...base, stage: 'op_running' })
        expect(t.find(m => m.id === 'op_starts')!.state).toBe('current')
        expect(t.find(m => m.id === 'rsvp_closes')!.state).toBe('done')
    })

    test('closes confirmations 24 hours after they open, not 48', () => {
        const t = buildTimeline({
            ...base,
            stage: 'confirmations_open',
            confirmationOpen: true,
            confirmationOpenedAt: '2026-11-18T12:00:00.000Z',
        })
        expect(t.find(m => m.id === 'completed')!.at)
            .toEqual(new Date('2026-11-19T12:00:00.000Z'))
    })

    test('survives an operation with no date at all', () => {
        const t = buildTimeline({ ...base, operationDate: null })
        expect(t).toHaveLength(5)
        expect(t.find(m => m.id === 'op_starts')!.at).toBeNull()
    })
})
