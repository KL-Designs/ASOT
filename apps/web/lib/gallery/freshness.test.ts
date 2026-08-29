import { describe, test, expect } from 'vitest'
import { isNewlyPublished, NEW_BADGE_DAYS } from './freshness'

const NOW = new Date('2026-08-30T12:00:00Z')
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

describe('isNewlyPublished', () => {
    test('the window is a week', () => {
        expect(NEW_BADGE_DAYS).toBe(7)
    })

    test('published moments ago', () => {
        expect(isNewlyPublished(NOW, NOW)).toBe(true)
    })

    test('published six days ago is still new', () => {
        expect(isNewlyPublished(daysBefore(6), NOW)).toBe(true)
    })

    test('published eight days ago is not', () => {
        expect(isNewlyPublished(daysBefore(8), NOW)).toBe(false)
    })

    test('the boundary is inclusive at exactly seven days', () => {
        expect(isNewlyPublished(daysBefore(7), NOW)).toBe(true)
        expect(isNewlyPublished(new Date(daysBefore(7).getTime() - 1000), NOW)).toBe(false)
    })

    test('accepts the ISO string the API actually sends', () => {
        expect(isNewlyPublished(daysBefore(2).toISOString(), NOW)).toBe(true)
    })

    test('a migrated legacy item never carries the badge', () => {
        // No publishedAt at all. If this returned true the whole archive would
        // light up the day the migration runs.
        expect(isNewlyPublished(null, NOW)).toBe(false)
        expect(isNewlyPublished(undefined, NOW)).toBe(false)
    })

    test('an unparseable date is not new', () => {
        expect(isNewlyPublished('not a date', NOW)).toBe(false)
    })

    test('a future date is treated as new rather than as an error', () => {
        // Clock skew between the server that stamped it and the browser reading
        // it is real and small; refusing the badge over a few seconds of it
        // would be a worse answer than granting it.
        expect(isNewlyPublished(new Date(NOW.getTime() + 60_000), NOW)).toBe(true)
    })
})
