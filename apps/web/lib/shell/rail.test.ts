/**
 * `/about` is a prefix of `/about/faq`. A startsWith match lights two cells;
 * an exact match lights none on a nested route that has no cell of its own.
 * Longest-prefix is the only rule that gets both right.
 */
import { describe, test, expect } from 'vitest'
import { activeRailIndex, railIndex, type RailItem } from './rail'

const ABOUT: RailItem[] = [
    { href: '/about', label: 'About Us' },
    { href: '/about/callsigns', label: 'Callsigns' },
    { href: '/about/contact', label: 'Contact Us' },
    { href: '/about/rules', label: 'Rules & Expectations' },
    { href: '/about/values', label: 'Principles & Values' },
    { href: '/about/faq', label: 'FAQ' },
]

describe('activeRailIndex', () => {
    test('matches the index page exactly', () => {
        expect(activeRailIndex(ABOUT, '/about')).toBe(0)
    })

    test('a child route does not also light its parent', () => {
        expect(activeRailIndex(ABOUT, '/about/faq')).toBe(5)
        expect(activeRailIndex(ABOUT, '/about/callsigns')).toBe(1)
    })

    test('an unlisted descendant resolves to its nearest listed ancestor', () => {
        expect(activeRailIndex(ABOUT, '/about/rules/appendix')).toBe(3)
    })

    test('tolerates a trailing slash', () => {
        expect(activeRailIndex(ABOUT, '/about/values/')).toBe(4)
    })

    test('returns -1 when nothing matches', () => {
        expect(activeRailIndex(ABOUT, '/join')).toBe(-1)
        expect(activeRailIndex([], '/about')).toBe(-1)
    })

    test('does not match a sibling that merely shares a prefix string', () => {
        const items: RailItem[] = [
            { href: '/about', label: 'About' },
            { href: '/aboutus', label: 'About Us' },
        ]
        expect(activeRailIndex(items, '/aboutus')).toBe(1)
    })
})

describe('railIndex', () => {
    test('is 1-based and zero-padded to two digits', () => {
        expect(railIndex(0)).toBe('01')
        expect(railIndex(5)).toBe('06')
        expect(railIndex(9)).toBe('10')
    })

    test('does not pad past two digits', () => {
        expect(railIndex(99)).toBe('100')
    })
})
