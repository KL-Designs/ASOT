import { describe, expect, it } from 'vitest'
import { formatUntil } from './countdown'

const AT = Date.UTC(2026, 7, 27, 10, 0, 0)
const after = (ms: number) => new Date(AT + ms).toISOString()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatUntil', () => {
    it('drops minutes past a day — the figure is read at a glance, not planned against', () => {
        expect(formatUntil(after(2 * DAY + 14 * HOUR + 37 * MIN), AT)).toBe('2d 14h')
    })

    it('keeps minutes inside a day, where they start to matter', () => {
        expect(formatUntil(after(14 * HOUR + 30 * MIN), AT)).toBe('14h 30m')
    })

    it('drops to minutes alone in the last hour', () => {
        expect(formatUntil(after(30 * MIN), AT)).toBe('30m')
    })

    /*
       A 25-hour gap is "1d 1h", not "25h". The unit boundary is what makes the
       figure scannable — the whole point of it being large.
    */
    it('crosses into days at 24 hours', () => {
        expect(formatUntil(after(25 * HOUR), AT)).toBe('1d 1h')
        expect(formatUntil(after(23 * HOUR + 59 * MIN), AT)).toBe('23h 59m')
    })

    it('reads as running once the start time has passed', () => {
        expect(formatUntil(after(-1 * MIN), AT)).toBe('Running')
        expect(formatUntil(after(0), AT)).toBe('Running')
    })

    /*
       Rounding down, always. An op 59 seconds away is not "1m" — saying so
       would let the figure claim time the reader does not have.
    */
    it('floors rather than rounds', () => {
        expect(formatUntil(after(59_000), AT)).toBe('0m')
        expect(formatUntil(after(2 * DAY - 1), AT)).toBe('1d 23h')
    })

    it('returns null for a date it cannot read, so the tile can fall back', () => {
        expect(formatUntil('not a date', AT)).toBeNull()
        expect(formatUntil('', AT)).toBeNull()
    })
})
