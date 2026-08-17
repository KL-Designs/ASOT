/**
 * These figures appear on the profile page, on the Discord dossier card, and
 * feed the promotion-points bar members are actually promoted on — so they are
 * worth pinning rather than trusting to two copies staying in step.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { durationSince, resolveEnlistedDate, getPromotionProgress } from './milpac-stats'
import { RANK_TRACKS } from './promotion-requirements'

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

describe('getPromotionProgress', () => {
    test('reports progress through the current tier, not from zero', () => {
        // The bar spans from the *previous* rank's threshold (PTE(L), 151) to
        // the next rank's (PTE(SL), 451) — not 0 to 451 — so 280 points is 129
        // into a 300-point span, i.e. 43%. It is not measured from the current
        // rank's own threshold (PTE(S), 251); that would give 14.5%, which is
        // what this test originally asserted until the real arithmetic in
        // getPromotionProgress (ported verbatim from milpac-file.tsx) was
        // checked against it.
        const p = getPromotionProgress('PTE(S)', 280)
        expect(p).toMatchObject({ atMax: false, nextRank: 'PTE(SL)', required: 451, current: 280 })
        expect((p as { pct: number }).pct).toBeCloseTo(43, 1)
    })

    test('the top of a track has no next rank', () => {
        const track = RANK_TRACKS[0]
        const top = track.ranks[track.ranks.length - 1].abbr
        expect(getPromotionProgress(top, 9999)).toEqual({ atMax: true })
    })

    test('a rank on no track, or none at all, yields null', () => {
        expect(getPromotionProgress('NOT-A-RANK', 100)).toBeNull()
        expect(getPromotionProgress(undefined, 100)).toBeNull()
    })

    test('progress is clamped to the bar, never past it', () => {
        const over = getPromotionProgress('PTE(S)', 100000)
        const under = getPromotionProgress('PTE(S)', 0)
        expect((over as { pct: number }).pct).toBe(100)
        expect((under as { pct: number }).pct).toBe(0)
    })
})
