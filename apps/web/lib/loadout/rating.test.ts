/**
 * The star value arrives from a JSON body, and the average it feeds decides
 * the order of a public page. Both the validation and the ranking are worth
 * pinning down: sorting on the raw mean would put one 5-star rating above a
 * 4.8 earned across thirty.
 */
import { describe, test, expect } from 'vitest'
import { isStars, summarise, weightedScore, formatAvg, NO_RATING } from './rating'

describe('star validation', () => {
    test('accepts 1 through 5', () => {
        for (const n of [1, 2, 3, 4, 5]) expect(isStars(n)).toBe(true)
    })

    test('rejects out of range, fractional and non-numeric', () => {
        for (const bad of [0, 6, -1, 3.5, NaN, Infinity, '4', null, undefined, {}]) {
            expect(isStars(bad)).toBe(false)
        }
    })
})

describe('summarise', () => {
    test('averages and counts', () => {
        expect(summarise([5, 4, 3])).toEqual({ avg: 4, count: 3 })
    })

    test('rounds to two decimals', () => {
        expect(summarise([5, 4, 4])).toEqual({ avg: 4.33, count: 3 })
    })

    test('an unrated kit is zero, not NaN', () => {
        expect(summarise([])).toEqual({ avg: 0, count: 0 })
    })
})

describe('weightedScore', () => {
    test('a well-supported 4.8 outranks a lone 5.0', () => {
        expect(weightedScore(4.8, 30)).toBeGreaterThan(weightedScore(5, 1))
    })

    test('approaches the true mean as ratings accumulate', () => {
        expect(weightedScore(5, 500)).toBeCloseTo(5, 1)
    })

    test('an unrated kit scores zero, so it sorts last', () => {
        expect(weightedScore(0, 0)).toBe(0)
    })

    test('more ratings at an above-prior average raise the score', () => {
        expect(weightedScore(4.5, 20)).toBeGreaterThan(weightedScore(4.5, 2))
    })
})

describe('formatAvg', () => {
    test('one decimal place', () => {
        expect(formatAvg(4.33, 3)).toBe('4.3')
        expect(formatAvg(5, 2)).toBe('5.0')
    })

    test('an unrated kit shows no number at all', () => {
        expect(formatAvg(0, 0)).toBe(NO_RATING)
    })
})
