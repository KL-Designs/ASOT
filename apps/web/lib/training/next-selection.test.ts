import { describe, expect, test } from 'vitest'
import { discordTimestamp, fillPlaceholders, pickNextSelection, selectionDateLine } from './next-selection'

const now = new Date('2026-10-21T00:00:00Z')
const inst = (over: Partial<Parameters<typeof pickNextSelection>[0][number]>) => ({
    _id: 'x', instanceRef: 'SEL-001', courseType: 'selection' as const, status: 'planning' as const, session1Date: new Date('2026-11-01T09:00:00Z'), ...over,
})

describe('pickNextSelection', () => {
    test('picks the earliest future Session 1', () => {
        const next = pickNextSelection([
            inst({ _id: 'b', instanceRef: 'SEL-003', session1Date: new Date('2027-01-10T09:00:00Z') }),
            inst({ _id: 'a', instanceRef: 'SEL-002', session1Date: new Date('2026-12-01T09:00:00Z') }),
        ], now)
        expect(next?.instanceRef).toBe('SEL-002')
    })

    test('skips a Selection already underway (Session 1 in the past)', () => {
        const next = pickNextSelection([
            inst({ instanceRef: 'SEL-001', status: 'in_progress', session1Date: new Date('2026-10-14T09:00:00Z') }),
            inst({ instanceRef: 'SEL-002', session1Date: new Date('2027-01-10T09:00:00Z') }),
        ], now)
        expect(next?.instanceRef).toBe('SEL-002')
    })

    test('ignores cancelled, deleted, undated and non-Selection courses', () => {
        expect(pickNextSelection([
            inst({ status: 'cancelled' }),
            inst({ deletedAt: new Date() }),
            inst({ session1Date: undefined }),
            inst({ courseType: 'reinforcement_cycle' }),
        ], now)).toBeNull()
    })
})

describe('selectionDateLine', () => {
    test('no Selection reads "To be confirmed"', () => {
        expect(selectionDateLine(null)).toBe('To be confirmed')
    })
    test('a date uses Discord timestamps so each reader sees their own timezone', () => {
        const at = new Date('2026-11-01T09:00:00Z')
        const unix = Math.floor(at.getTime() / 1000)
        expect(selectionDateLine(at)).toBe(`<t:${unix}:F> (<t:${unix}:R>)`)
        expect(discordTimestamp(at, 'R')).toBe(`<t:${unix}:R>`)
    })
})

describe('fillPlaceholders', () => {
    test('fills known keys and leaves unknown ones visible', () => {
        expect(fillPlaceholders('Hi {name}, {nope}', { name: 'Smith' })).toBe('Hi Smith, {nope}')
    })
})
