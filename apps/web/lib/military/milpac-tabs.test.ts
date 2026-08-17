/**
 * The tabs are path segments rather than `?tab=` values, because the App Router
 * silently aborts navigations that change only the query string. These helpers
 * build the URLs that relies on — including the redirect suffix, which carries
 * a member-supplied kit id straight back out in a Location header.
 */
import { describe, test, expect } from 'vitest'
import { MILPAC_TABS, tabPath, tabSuffix, shareLabelFor } from './milpac-tabs'

describe('MILPAC_TABS', () => {
    test('every tab has a key and a label, and keys are unique', () => {
        const keys = MILPAC_TABS.map(t => t.key)
        expect(new Set(keys).size).toBe(keys.length)
        for (const tab of MILPAC_TABS) {
            expect(tab.label.length).toBeGreaterThan(0)
        }
    })

    test('every tab has a non-empty emoji for the Discord buttons', () => {
        for (const tab of MILPAC_TABS) {
            expect(tab.emoji.length).toBeGreaterThan(0)
        }
    })

    test("the site's own tab bar keeps saying Overview", () => {
        // This is the thing the Discord share-label change must not break —
        // the on-site tab bar reads `label`, not `shareLabel`.
        expect(MILPAC_TABS[0].label).toBe('Overview')
    })

    test('shareLabelFor renames only the overview tab, for Discord buttons', () => {
        expect(shareLabelFor(MILPAC_TABS[0])).toBe('MILPAC')
        expect(shareLabelFor(MILPAC_TABS[1])).toBe(MILPAC_TABS[1].label)
        expect(shareLabelFor(MILPAC_TABS[2])).toBe(MILPAC_TABS[2].label)
    })

    test('exactly one tab owns the bare profile URL', () => {
        // Two empty segments would make one of them unreachable.
        expect(MILPAC_TABS.filter(t => t.segment === '')).toHaveLength(1)
        expect(MILPAC_TABS[0].key).toBe('overview')
    })

    test('segments are unique and url-safe', () => {
        const segments = MILPAC_TABS.map(t => t.segment).filter(Boolean)
        expect(new Set(segments).size).toBe(segments.length)
        for (const seg of segments) expect(seg).toMatch(/^[a-z][a-z0-9-]*$/)
    })
})

describe('tabPath', () => {
    test('the default section is the bare profile URL', () => {
        expect(tabPath('overview')).toBe('')
    })

    test('every other section is a path segment', () => {
        expect(tabPath('record')).toBe('/record')
        expect(tabPath('kits')).toBe('/kits')
    })
})

describe('tabSuffix', () => {
    test('matches tabPath when no kit is addressed', () => {
        for (const tab of MILPAC_TABS) {
            expect(tabSuffix(tab.key)).toBe(tabPath(tab.key))
        }
    })

    test('a kit is appended only under the kits tab', () => {
        expect(tabSuffix('kits', 'abc123')).toBe('/kits/abc123')
        // A stray kit id on another section would invent a route that does not
        // exist, so it is dropped rather than carried.
        expect(tabSuffix('record', 'abc123')).toBe('/record')
        expect(tabSuffix('overview', 'abc123')).toBe('')
    })

    test('the kit id is encoded, not trusted', () => {
        // It arrives as a path segment and goes back out in a Location header.
        expect(tabSuffix('kits', '../../etc/passwd')).toBe('/kits/..%2F..%2Fetc%2Fpasswd')
        expect(tabSuffix('kits', 'a b')).toBe('/kits/a%20b')
        expect(tabSuffix('kits', 'a?b#c')).toBe('/kits/a%3Fb%23c')
    })

    test('an empty kit segment falls back to the tab itself', () => {
        expect(tabSuffix('kits', '')).toBe('/kits')
        expect(tabSuffix('kits', undefined)).toBe('/kits')
    })
})
