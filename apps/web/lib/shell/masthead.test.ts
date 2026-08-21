/**
 * The banner heights are the whole point of the redesign — `md` was 60vh,
 * which put ~742px of photograph above the fold on six of ten pages. A
 * regression here is invisible in review and obvious to every visitor.
 */
import { describe, test, expect } from 'vitest'
import { bannerHeightValue } from './masthead'

describe('bannerHeightValue', () => {
    test('maps each size to a clamped pixel height', () => {
        expect(bannerHeightValue('xsm')).toBe('clamp(140px, 20vh, 190px)')
        expect(bannerHeightValue('sm')).toBe('clamp(210px, 30vh, 320px)')
        expect(bannerHeightValue('md')).toBe('clamp(290px, 42vh, 440px)')
        expect(bannerHeightValue('lg')).toBe('clamp(350px, 52vh, 540px)')
    })

    test('defaults to md, matching the old Container default', () => {
        expect(bannerHeightValue()).toBe(bannerHeightValue('md'))
        expect(bannerHeightValue(undefined)).toBe(bannerHeightValue('md'))
    })

    test('never returns a vh-only value', () => {
        for (const size of ['xsm', 'sm', 'md', 'lg'] as const) {
            expect(bannerHeightValue(size)).toContain('px')
        }
    })
})
