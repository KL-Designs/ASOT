/**
 * A header value that throws only for some inputs is worse than one that always
 * does — this went out working and broke when an emoji was added months later.
 */
import { describe, test, expect } from 'vitest'
import { asciiJson } from './ascii-header'

describe('asciiJson', () => {
    test('escapes emoji, including surrogate pairs', () => {
        const out = asciiJson([{ emoji: '🪖' }])
        expect(out).not.toMatch(/[^\x00-\x7F]/)
        expect(out).toContain('\\ud83e')
    })

    test('round-trips through JSON.parse unchanged', () => {
        const links = [
            { label: 'MILPAC', path: '/milpacs/koda', emoji: '🪖' },
            { label: 'Service Record', path: '/milpacs/koda/record', emoji: '🎖️' },
            { label: 'Kits', path: '/milpacs/koda/kits', emoji: '🎒' },
        ]
        expect(JSON.parse(asciiJson(links))).toEqual(links)
    })

    test('the result is accepted as a header value', () => {
        // The actual failure mode: Response construction threw on the raw form.
        expect(() => new Headers({ 'X-Test': asciiJson([{ emoji: '🎒' }]) })).not.toThrow()
        expect(() => new Headers({ 'X-Test': JSON.stringify([{ emoji: '🎒' }]) })).toThrow()
    })

    test('plain ASCII is left exactly as JSON.stringify produced it', () => {
        const plain = [{ label: 'Kits', path: '/milpacs/koda/kits' }]
        expect(asciiJson(plain)).toBe(JSON.stringify(plain))
    })
})
