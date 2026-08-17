/**
 * The share card draws a member's cover photo at a fixed 1300x630, but covers
 * are uploaded at whatever size and shape the member had to hand — the upload
 * route neither resizes nor validates them.
 *
 * fitCover is the crop that reconciles the two. It is the CSS `object-fit:
 * cover` rule expressed as a source rectangle, so the canvas re-encode fills
 * the card without ever stretching a face sideways.
 */
import { describe, test, expect } from 'vitest'
import { fitCover } from './milpac-cover'

describe('fitCover', () => {
    test('a source already at the box aspect is used whole', () => {
        expect(fitCover(2600, 1260, 1300, 630)).toEqual({ sx: 0, sy: 0, sw: 2600, sh: 1260 })
    })

    test('a source wider than the box is cropped left and right, centred', () => {
        // 2000x630 into a 1300x630 box: keep the full height, take the middle
        // 1300-worth of width (630 * 1300/630 = 1300).
        expect(fitCover(2000, 630, 1300, 630)).toEqual({ sx: 350, sy: 0, sw: 1300, sh: 630 })
    })

    test('a source taller than the box is cropped top and bottom, centred', () => {
        // A phone screenshot: keep the full width, take the middle band. The
        // height is a repeating decimal, so it is checked to a tolerance —
        // pinning the last bit would test the FPU, not the crop.
        const { sx, sy, sw, sh } = fitCover(1000, 2000, 1300, 630)
        expect({ sx, sw }).toEqual({ sx: 0, sw: 1000 })
        expect(sh).toBeCloseTo(1000 * 630 / 1300, 9)
        expect(sy).toBeCloseTo((2000 - sh) / 2, 9)
    })

    test('a square source into a wide box keeps the middle band', () => {
        const { sx, sy, sw, sh } = fitCover(1000, 1000, 1300, 630)
        expect({ sx, sw }).toEqual({ sx: 0, sw: 1000 })
        // Centred: the discarded height is split evenly above and below.
        expect(sy).toBeCloseTo((1000 - sh) / 2, 6)
        expect(sh).toBeCloseTo(1000 * (630 / 1300), 6)
    })

    test('the crop never reaches outside the source', () => {
        for (const [w, h] of [[3840, 2160], [800, 600], [1, 4000], [4000, 1]]) {
            const { sx, sy, sw, sh } = fitCover(w, h, 1300, 630)
            expect(sx).toBeGreaterThanOrEqual(0)
            expect(sy).toBeGreaterThanOrEqual(0)
            expect(sx + sw).toBeLessThanOrEqual(w + 1e-9)
            expect(sy + sh).toBeLessThanOrEqual(h + 1e-9)
        }
    })

    test('a degenerate source is returned unchanged rather than dividing by zero', () => {
        // A 0-byte or corrupt decode should not produce NaN geometry that
        // silently poisons drawImage — the caller drops the cover instead.
        expect(fitCover(0, 0, 1300, 630)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 })
    })
})
