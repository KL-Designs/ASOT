import { describe, test, expect } from 'vitest'
import { consolePalette } from './console-palette'
import { contrastRatio, hexToHsl, hslToHex } from '@/lib/colour'

/** The Sci-Fi theme's own floors, as `scifi.module.css` documents them. The
 *  ratios are deliberately above AA: the raster lays a line of black over one
 *  row in three, and a colour sitting on the 4.5:1 floor cannot afford it. */
const FLOOR = {
    phos: 7,     // the signal — titles, headings, the muster button
    phos2: 4.5,  // the dimmer tube — markers, the seat bar
    ink: 12,     // strong text
    ink2: 7,     // body
    ink3: 4.5,   // gauge labels: small uppercase mono, wide tracking
    alarm: 4.5,
} as const

/** Every hue, at a saturation and lightness a picker might plausibly produce. */
const HUES = Array.from({ length: 24 }, (_, i) => i * 15)

describe('consolePalette', () => {
    test('every hue produces a screen that clears its own floors', () => {
        for (const h of HUES) {
            const p = consolePalette(hslToHex({ h, s: 0.85, l: 0.5 }))
            for (const [key, floor] of Object.entries(FLOOR)) {
                const ratio = contrastRatio(p[key as keyof typeof FLOOR], p.glass)
                expect(ratio, `${key} at hue ${h} (${p[key as keyof typeof FLOOR]} on ${p.glass})`)
                    .toBeGreaterThanOrEqual(floor)
            }
        }
    })

    test('holds the hue — the operation still reads as its own colour', () => {
        for (const h of HUES) {
            const p = consolePalette(hslToHex({ h, s: 0.85, l: 0.5 }))
            const drift = Math.abs(hexToHsl(p.phos).h - h)
            expect(Math.min(drift, 360 - drift), `tube hue at ${h}`).toBeLessThan(3)
        }
    })

    test('the glass stays near-black whatever the hue', () => {
        for (const h of HUES) {
            const p = consolePalette(hslToHex({ h, s: 1, l: 0.5 }))
            // A tube at rest, not a coloured page. Anything brighter and the
            // ink ramp above it has nothing left to work with.
            expect(hexToHsl(p.glass).l, `glass at hue ${h}`).toBeLessThan(0.06)
        }
    })

    test('keeps text desaturated, so it cannot be confused with the signal', () => {
        for (const h of HUES) {
            const p = consolePalette(hslToHex({ h, s: 0.9, l: 0.5 }))
            expect(hexToHsl(p.ink2).s, `ink2 at hue ${h}`).toBeLessThan(hexToHsl(p.phos).s)
            expect(hexToHsl(p.ink3).s, `ink3 at hue ${h}`).toBeLessThan(hexToHsl(p.phos).s)
        }
    })

    describe('the alarm is the one lamp that is not the tube', () => {
        test('stays red when the tube is not red', () => {
            const green = consolePalette(hslToHex({ h: 140, s: 0.85, l: 0.5 }))
            expect(hexToHsl(green.alarm).h).toBeLessThan(15)
        })

        test('rotates to the complement when red would collide with the tube', () => {
            // An orange screen makes a red alarm nearly invisible long before
            // the two hues are actually equal — hence a 45° guard, not a tight one.
            for (const h of [0, 10, 20, 30, 40, 350, 340, 330]) {
                const p = consolePalette(hslToHex({ h, s: 0.85, l: 0.5 }))
                const drift = Math.abs(hexToHsl(p.alarm).h - h)
                expect(Math.min(drift, 360 - drift), `alarm separation at hue ${h}`)
                    .toBeGreaterThan(45)
            }
        })

        test('never sits within 45° of the tube, for any hue at all', () => {
            for (const h of HUES) {
                const p = consolePalette(hslToHex({ h, s: 0.85, l: 0.5 }))
                const drift = Math.abs(hexToHsl(p.alarm).h - h)
                expect(Math.min(drift, 360 - drift), `alarm separation at hue ${h}`)
                    .toBeGreaterThanOrEqual(45)
            }
        })
    })

    test('a near-grey theme colour still gives a coloured console, not a broken one', () => {
        // Saturation is floored, never cut: an unsaturated pick would otherwise
        // produce a grey screen, which is not a monochrome console.
        const p = consolePalette('#4a4a4a')
        expect(hexToHsl(p.phos).s).toBeGreaterThan(0.4)
        expect(contrastRatio(p.phos, p.glass)).toBeGreaterThanOrEqual(FLOOR.phos)
    })

    test('falls back to ASOT red rather than throwing on a missing colour', () => {
        const p = consolePalette('')
        expect(contrastRatio(p.ink2, p.glass)).toBeGreaterThanOrEqual(FLOOR.ink2)
    })
})
