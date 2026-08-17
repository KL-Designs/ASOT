/**
 * The accent colour feeds the milpac profile's entire palette through two CSS
 * custom properties, so a bad stored value must degrade to something readable
 * rather than produce invalid CSS — one malformed `rgba(var(--acc-rgb), .12)`
 * takes every tint on the page down with it.
 */
import { describe, test, expect } from 'vitest'
import { ensureVisible, hexToRgbTriplet } from './color'

describe('hexToRgbTriplet', () => {
    test('splits a hex colour into channels', () => {
        expect(hexToRgbTriplet('#d4a03a')).toBe('212,160,58')
        expect(hexToRgbTriplet('#ffffff')).toBe('255,255,255')
        expect(hexToRgbTriplet('#000000')).toBe('0,0,0')
    })

    test('tolerates a missing hash, surrounding space and upper case', () => {
        expect(hexToRgbTriplet('db001d')).toBe('219,0,29')
        expect(hexToRgbTriplet('  #DB001D  ')).toBe('219,0,29')
    })

    test('falls back to mid-grey rather than emitting invalid CSS', () => {
        for (const bad of ['', '#fff', 'red', '#12345', '#1234567', 'rgb(1,2,3)']) {
            expect(hexToRgbTriplet(bad)).toBe('136,136,136')
        }
    })

    test('agrees with ensureVisible, which runs first in the page', () => {
        // A near-black Discord accent becomes grey, and the triplet must follow
        // it — otherwise the text colour and its tints disagree.
        expect(hexToRgbTriplet(ensureVisible('#000000'))).toBe('136,136,136')
    })
})
