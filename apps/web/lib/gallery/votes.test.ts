import { describe, test, expect } from 'vitest'
import { voteDelta } from './votes'

describe('voteDelta', () => {
    test('a first up-vote', () => {
        expect(voteDelta(null, 1)).toEqual({ up: 1, down: 0 })
    })

    test('a first down-vote', () => {
        expect(voteDelta(null, -1)).toEqual({ up: 0, down: 1 })
    })

    test('changing up to down moves the vote rather than adding one', () => {
        expect(voteDelta(1, -1)).toEqual({ up: -1, down: 1 })
    })

    test('changing down to up moves the vote rather than adding one', () => {
        expect(voteDelta(-1, 1)).toEqual({ up: 1, down: -1 })
    })

    test('withdrawing removes only what was there', () => {
        expect(voteDelta(1, null)).toEqual({ up: -1, down: 0 })
        expect(voteDelta(-1, null)).toEqual({ up: 0, down: -1 })
    })

    test('re-casting the same vote changes nothing', () => {
        // The route treats this as a withdrawal before it gets here, but the
        // arithmetic has to be safe on its own — a double-submit must not
        // double-count.
        expect(voteDelta(1, 1)).toEqual({ up: 0, down: 0 })
        expect(voteDelta(-1, -1)).toEqual({ up: 0, down: 0 })
    })

    test('withdrawing a vote that was never cast changes nothing', () => {
        expect(voteDelta(null, null)).toEqual({ up: 0, down: 0 })
    })
})
