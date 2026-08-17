/**
 * The tab comes from a query string, which anyone can type anything into. It
 * decides which half of a public page renders, so an unrecognised value has to
 * land somewhere sensible rather than rendering nothing at all.
 */
import { describe, test, expect } from 'vitest'
import { resolveTab, MILPAC_TABS } from './milpac-tabs'

describe('resolveTab', () => {
    test('accepts every declared tab key', () => {
        for (const tab of MILPAC_TABS) {
            expect(resolveTab(tab.key)).toBe(tab.key)
        }
    })

    test('an absent tab falls back to the first one', () => {
        // The bare /milpacs/koda URL is the common case, not an edge case.
        expect(resolveTab(undefined)).toBe('overview')
        expect(resolveTab('')).toBe('overview')
    })

    test('an unrecognised value falls back rather than rendering nothing', () => {
        expect(resolveTab('kit')).toBe('overview')
        expect(resolveTab('../../etc/passwd')).toBe('overview')
        expect(resolveTab('__proto__')).toBe('overview')
    })

    test('a repeated query param takes the first value', () => {
        // ?tab=loadout&tab=record arrives as an array; picking one beats throwing.
        expect(resolveTab(['loadout', 'record'])).toBe('loadout')
        expect(resolveTab(['nonsense', 'loadout'])).toBe('overview')
        expect(resolveTab([])).toBe('overview')
    })

    test('matching is exact, not case-insensitive or trimmed', () => {
        // The links this app generates are always lowercase, so anything else
        // is hand-typed and better served by the default than by a guess.
        expect(resolveTab('LOADOUT')).toBe('overview')
        expect(resolveTab(' loadout')).toBe('overview')
    })

    test('every tab has a key and a label, and keys are unique', () => {
        const keys = MILPAC_TABS.map(t => t.key)
        expect(new Set(keys).size).toBe(keys.length)
        for (const tab of MILPAC_TABS) {
            expect(tab.label.length).toBeGreaterThan(0)
        }
    })
})
