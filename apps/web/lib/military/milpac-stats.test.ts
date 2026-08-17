/**
 * These figures appear on the profile page, on the Discord dossier card, and
 * feed the promotion-points bar members are actually promoted on — so they are
 * worth pinning rather than trusting to two copies staying in step.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { durationSince, resolveEnlistedDate } from './milpac-stats'

describe('durationSince', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 7, 18))
    })
    afterEach(() => vi.useRealTimers())

    test('under a year reads in whole months', () => {
        expect(durationSince('18 February 2026')).toBe('6M')
    })

    test('a year or more reads in years to one decimal', () => {
        expect(durationSince('18 August 2024')).toBe('2.0Y')
        expect(durationSince('15 August 2020')).toBe('6.0Y')
    })

    test('day-first slash dates are read day-first', () => {
        // 4 October 2024, not 10 April — the trap parseMilpacDate exists for.
        expect(durationSince('04/10/2024')).toBe('1.9Y')
    })

    test('an unparseable or future date yields null, never NaN', () => {
        // Deliberately free of any 4-digit year — not 'sometime in 2019'. Node's
        // lenient Date() fallback extracts a bare year from free text and parses
        // it as 1 Jan of that year rather than rejecting it, so a fixture
        // containing one would silently stop testing what this test claims to
        // test. Same trap milpac-dates.test.ts avoids in its own "nothing
        // usable" fixtures — don't "restore" a year-bearing string here.
        expect(durationSince('not a real date')).toBeNull()
        expect(durationSince(undefined)).toBeNull()
        expect(durationSince('18 August 2030')).toBeNull()
    })
})

describe('resolveEnlistedDate', () => {
    test('prefers the stored milpac date', () => {
        const member = {
            milpac: { enlistedDate: '15 August 2020' },
            guild: { joinedTimestamp: Date.UTC(2023, 0, 5) },
        } as unknown as User
        expect(resolveEnlistedDate(member)).toBe('15 August 2020')
    })

    test('falls back to the Discord join date when none is stored', () => {
        const member = {
            milpac: {},
            guild: { joinedTimestamp: new Date(2023, 0, 5).getTime() },
        } as unknown as User
        expect(resolveEnlistedDate(member)).toBe('5 Jan 2023')
    })

    test('null when neither exists', () => {
        expect(resolveEnlistedDate({ milpac: {} } as unknown as User)).toBeNull()
    })
})
