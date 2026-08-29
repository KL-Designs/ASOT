import { describe, test, expect } from 'vitest'
import { contrastRatio, hexToHsl, hexToRgb, hslToHex, readableOn, rgbTriplet } from './colour'

describe('hexToRgb', () => {
    test('parses a six-digit hex with or without the hash', () => {
        expect(hexToRgb('#db001d')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('db001d')).toEqual({ r: 219, g: 0, b: 29 })
    })

    test('falls back to ASOT red on anything malformed', () => {
        expect(hexToRgb('')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('#fff')).toEqual({ r: 219, g: 0, b: 29 })
    })
})

describe('rgbTriplet', () => {
    test('formats for CSS custom properties', () => {
        expect(rgbTriplet('#4dd0e1')).toBe('77,208,225')
    })
})

describe('contrastRatio', () => {
    test('is 21:1 for black on white, and order-independent', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
        expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    })

    test('is 1:1 for a colour against itself', () => {
        expect(contrastRatio('#db001d', '#db001d')).toBeCloseTo(1, 5)
    })

    test('measures the case that started this — ASOT red on the console glass', () => {
        // 3.87:1. Under AA for normal text, which is why `readableOn` exists.
        expect(contrastRatio('#db001d', '#05070a')).toBeLessThan(4.5)
    })
})

describe('hexToHsl / hslToHex', () => {
    test('round-trips a saturated colour', () => {
        expect(hslToHex(hexToHsl('#db001d'))).toBe('#db001d')
    })

    test('handles greys, which have no meaningful hue', () => {
        const hsl = hexToHsl('#808080')
        expect(hsl.s).toBe(0)
        expect(hslToHex(hsl)).toBe('#808080')
    })
})

describe('readableOn', () => {
    const GLASS = '#05070a'   // the Sci-Fi console
    const PAPER = '#e8e2d2'   // Cold War

    test('leaves a colour that already clears the ratio completely alone', () => {
        expect(readableOn('#62e8b0', GLASS, 4.5)).toBe('#62e8b0')
    })

    test('lightens against a dark ground until it clears', () => {
        const out = readableOn('#db001d', GLASS, 4.5)
        expect(contrastRatio(out, GLASS)).toBeGreaterThanOrEqual(4.5)
    })

    test('darkens against a light ground until it clears', () => {
        const out = readableOn('#4dd0e1', PAPER, 4.5)
        expect(contrastRatio(out, PAPER)).toBeGreaterThanOrEqual(4.5)
    })

    test('holds the hue, so the operation still reads as its own colour', () => {
        for (const accent of ['#db001d', '#4dd0e1', '#7c3aed', '#f59e0b']) {
            const before = hexToHsl(accent).h
            const after = hexToHsl(readableOn(accent, GLASS, 7)).h
            expect(Math.abs(after - before)).toBeLessThan(2)
        }
    })

    test('clears the ratio for every hue on both grounds', () => {
        for (let h = 0; h < 360; h += 15) {
            const accent = hslToHex({ h, s: 0.9, l: 0.45 })
            expect(contrastRatio(readableOn(accent, GLASS, 4.5), GLASS)).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(readableOn(accent, PAPER, 4.5), PAPER)).toBeGreaterThanOrEqual(4.5)
        }
    })

    test('floors saturation so a near-grey accent does not walk to plain white', () => {
        const out = readableOn('#4a4a4a', GLASS, 7)
        expect(hexToHsl(out).s).toBeGreaterThan(0.4)
    })
})
