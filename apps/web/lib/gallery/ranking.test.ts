import { describe, test, expect } from 'vitest'
import { wilsonScore } from './ranking'

describe('wilsonScore', () => {
    test('an unvoted item scores zero', () => {
        expect(wilsonScore(0, 0)).toBe(0)
    })

    test('a well-voted item outranks a barely-voted perfect one', () => {
        // The whole reason this is not a raw ratio: 1/1 is 100% and 40/42 is
        // 95%, and ordering by ratio would put the single vote on top forever.
        expect(wilsonScore(40, 2)).toBeGreaterThan(wilsonScore(1, 0))
    })

    test('more agreeing votes always score higher than fewer', () => {
        expect(wilsonScore(100, 0)).toBeGreaterThan(wilsonScore(10, 0))
        expect(wilsonScore(10, 0)).toBeGreaterThan(wilsonScore(1, 0))
    })

    test('downvotes lower the score', () => {
        expect(wilsonScore(10, 0)).toBeGreaterThan(wilsonScore(10, 5))
        expect(wilsonScore(10, 5)).toBeGreaterThan(wilsonScore(10, 40))
    })

    test('the result is always a proportion', () => {
        for (const [up, down] of [[0, 0], [1, 0], [0, 1], [500, 3], [3, 500]]) {
            const score = wilsonScore(up, down)
            expect(score).toBeGreaterThanOrEqual(0)
            expect(score).toBeLessThanOrEqual(1)
        }
    })

    test('an all-negative item scores zero-ish, not negative', () => {
        expect(wilsonScore(0, 50)).toBeGreaterThanOrEqual(0)
        expect(wilsonScore(0, 50)).toBeLessThan(0.1)
    })
})
