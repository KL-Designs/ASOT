import { describe, expect, test } from 'vitest'
import { findClashes, overlaps } from './clashes'

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 21, hour, minute))

describe('overlaps', () => {
    test('when each starts before the other ends', () => {
        expect(overlaps(0, 10, 5, 15)).toBe(true)
        expect(overlaps(5, 15, 0, 10)).toBe(true)
        expect(overlaps(0, 10, 2, 3)).toBe(true)
    })

    test('back to back is not a clash', () => {
        expect(overlaps(0, 10, 10, 20)).toBe(false)
    })
})

describe('findClashes', () => {
    test('finds what overlaps the session, earliest first', () => {
        const clashes = findClashes(at(9), 120, [
            { kind: 'training', title: 'Late', start: at(10, 30), end: at(11, 30) },
            { kind: 'calendar', title: 'Early', start: at(8), end: at(9, 30) },
            { kind: 'training', title: 'Tomorrow', start: new Date(Date.UTC(2026, 9, 22, 9)), end: new Date(Date.UTC(2026, 9, 22, 10)) },
        ])
        expect(clashes.map(c => c.title)).toEqual(['Early', 'Late'])
    })

    test('something that ends as the session starts is left out', () => {
        expect(findClashes(at(9), 60, [{ kind: 'training', title: 'Before', start: at(8), end: at(9) }])).toEqual([])
    })

    test('a mission with no recorded end is taken to run three hours', () => {
        const mission = { kind: 'operation' as const, title: 'Op', start: at(9) }
        expect(findClashes(at(11, 30), 60, [mission])).toHaveLength(1)
        expect(findClashes(at(12), 60, [mission])).toHaveLength(0)
    })

    test('an end before its start falls back to the default length', () => {
        expect(findClashes(at(9, 30), 30, [{ kind: 'training', title: 'Odd', start: at(9), end: at(8) }])).toHaveLength(1)
    })

    test('an unreadable time clashes with nothing', () => {
        expect(findClashes('not a date', 60, [{ kind: 'training', title: 'x', start: at(9) }])).toEqual([])
    })
})

test('the same thing at the same time is one row with a count', () => {
    const at = '2026-11-06T02:00:00Z'
    const dev = { kind: 'operation' as const, title: 'A mission in development', start: at }
    const clashes = findClashes(at, 60, [dev, dev, dev, { kind: 'operation', title: 'Op Anvil', start: at }])
    expect(clashes.map(c => c.title)).toEqual(['A mission in development (×3)', 'Op Anvil'])
})
