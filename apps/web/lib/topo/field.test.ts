import { describe, expect, it } from 'vitest'
import { cellSegments, fbm3 } from './field'

/**
 * Corners are named for their position in the cell: a top-left, b top-right,
 * c bottom-right, d bottom-left. Segments come back flat — x0, y0, x1, y1 per
 * segment — in unit coordinates, so a crossing halfway along the top edge is
 * (0.5, 0).
 */
const seg = (v: number[]) => v.map(n => Math.round(n * 1000) / 1000)

describe('cellSegments', () => {
    it('emits nothing for a cell wholly above or wholly below the level', () => {
        expect(cellSegments(0.1, 0.2, 0.15, 0.05, 0.5)).toEqual([])
        expect(cellSegments(0.9, 0.8, 0.85, 0.95, 0.5)).toEqual([])
    })

    it('cuts a corner off when one corner crosses', () => {
        // Only a (top-left) is above: the contour runs from the left edge to
        // the top edge, both crossed at their midpoints.
        expect(seg(cellSegments(1, 0, 0, 0, 0.5))).toEqual([0, 0.5, 0.5, 0])
    })

    it('interpolates the crossing rather than snapping to the midpoint', () => {
        // a=1, b=0 puts the top crossing at 0.75 for level 0.25; a=1, d=0 puts
        // the left crossing at the same place.
        expect(seg(cellSegments(1, 0, 0, 0, 0.25))).toEqual([0, 0.75, 0.75, 0])
    })

    it('runs edge to edge when one side is above', () => {
        // a and b above, c and d below — a single contour crossing left to right.
        expect(seg(cellSegments(1, 1, 0, 0, 0.5))).toEqual([0, 0.5, 1, 0.5])
    })

    /*
       The saddle is the only case where the corners do not determine the
       answer. Two opposite corners are above and two below, and the contours
       can join either way; the cell centre breaks the tie. Guessing produces
       lines that cross, which never happens on a real contour map.
    */
    it('resolves a saddle by the cell centre — high centre joins the high corners', () => {
        // b and d above, centre above: the two high corners connect through the
        // middle, so the contours wrap a and c separately.
        expect(seg(cellSegments(0.4, 1, 0.4, 1, 0.5))).toEqual([0, 0.167, 0.167, 0, 0.833, 1, 1, 0.833])
    })

    it('resolves a saddle the other way when the centre is low', () => {
        // b and d above, centre below: the low corners connect instead, so the
        // contours wrap b and c the other way about.
        const out = cellSegments(0.1, 0.6, 0.1, 0.6, 0.5)
        expect(out).toHaveLength(8)
        // The two segments must not be the high-centre pairing.
        expect(seg(out)).not.toEqual(seg(cellSegments(0.4, 1, 0.4, 1, 0.5)))
    })

    it('gives the same geometry for a cell and its inverse', () => {
        // Flipping which side of the level every corner sits on traces the same
        // line — a contour has no preferred side.
        const up = seg(cellSegments(0.8, 0.2, 0.2, 0.2, 0.5))
        const down = seg(cellSegments(0.2, 0.8, 0.8, 0.8, 0.5))
        expect(up).toEqual(down)
    })
})

describe('fbm3', () => {
    it('stays inside 0..1 so contour levels can be spaced across it', () => {
        for (let i = 0; i < 400; i++) {
            const v = fbm3(i * 0.37, i * 0.11, i * 0.05)
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
        }
    })

    it('is deterministic — the same point always returns the same height', () => {
        expect(fbm3(3.2, 1.7, 0.4)).toBe(fbm3(3.2, 1.7, 0.4))
    })

    it('is continuous, so contours never tear between adjacent samples', () => {
        const a = fbm3(2, 2, 1)
        const b = fbm3(2.001, 2, 1)
        expect(Math.abs(a - b)).toBeLessThan(0.01)
    })

    it('actually varies over time — the third axis is what makes the field live', () => {
        expect(fbm3(2, 2, 0)).not.toBe(fbm3(2, 2, 4))
    })
})
