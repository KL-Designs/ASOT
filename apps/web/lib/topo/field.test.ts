import { describe, expect, it } from 'vitest'
import { cellSegments, fbm3, highestLevel, lowestLevel } from './field'

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

    /*
       Regression: the field used to stall and surge.

       The quintic fade has a derivative of zero at every lattice boundary, and
       applying it to the time axis made that a change in *speed*. At z = 0 all
       four octaves sit on a boundary at once, so a freshly loaded page opened
       frozen and took about a minute to reach full speed — measured at 0.1% of
       the steady rate on the first frame.

       Spatial axes still use the quintic: there it hides the lattice in the
       image, which is a real job. On the time axis there is no lattice to hide,
       only a speed to keep constant.
    */
    const STEP = 0.0055 // one second of clock at the shipped drift rate

    function changeRate(z: number): number {
        let sum = 0
        for (let i = 0; i < 240; i++) {
            const x = (i % 20) * 0.13, y = Math.floor(i / 20) * 0.17
            sum += Math.abs(fbm3(x, y, z + STEP) - fbm3(x, y, z))
        }
        return sum / 240
    }

    it('morphs at a steady rate, including from a standing start at z = 0', () => {
        const rates = [0, 0.03, 0.1, 0.25, 0.5, 0.75, 0.97, 1, 1.4, 2.2].map(changeRate)
        const min = Math.min(...rates)
        const max = Math.max(...rates)

        expect(min).toBeGreaterThan(0)
        // A lattice crossing still changes the gradient the field is moving
        // along, so some spread is inherent. A stall is not.
        expect(max / min).toBeLessThan(4)
    })

    it('does not open frozen — the first second moves like any other', () => {
        const atLoad = changeRate(0)
        const settled = changeRate(0.5)
        expect(atLoad / settled).toBeGreaterThan(0.25)
    })
})

describe('lowestLevel / highestLevel', () => {
    /*
       Levels sit at L / (levels + 1), so with 30 levels they run 1/31 … 30/31.
       A cell carries level v when min <= v < max — the same convention
       cellSegments uses when it treats a corner exactly on the level as below
       it. The two have to agree or contours are dropped or drawn twice.
    */
    it('returns only the levels that fall inside the corner range', () => {
        expect(lowestLevel(0.2, 30)).toBe(7)
        expect(highestLevel(0.5, 30)).toBe(15)
        // 7/31 = 0.2258 is the first at or above 0.2; 16/31 = 0.516 is past 0.5.
        expect(7 / 31).toBeGreaterThanOrEqual(0.2)
        expect(15 / 31).toBeLessThan(0.5)
        expect(16 / 31).toBeGreaterThan(0.5)
    })

    it('reports an empty range for a cell lying between two contours', () => {
        expect(highestLevel(0.221, 30)).toBeLessThan(lowestLevel(0.201, 30))
    })

    it('clamps to the levels that actually exist', () => {
        expect(lowestLevel(0, 30)).toBe(1)
        expect(highestLevel(1, 30)).toBe(30)
        expect(lowestLevel(-0.4, 30)).toBe(1)
        expect(highestLevel(1.6, 30)).toBe(30)
    })

    /*
       The contract that matters: whatever the range excludes must genuinely
       produce nothing. Checked against cellSegments itself rather than against
       my arithmetic.
    */
    it('never excludes a level that cellSegments would have drawn', () => {
        const levels = 30
        let checked = 0
        for (let s = 0; s < 500; s++) {
            const a = ((s * 37) % 100) / 100, b = ((s * 61) % 100) / 100
            const c = ((s * 83) % 100) / 100, d = ((s * 29) % 100) / 100
            const lo = lowestLevel(Math.min(a, b, c, d), levels)
            const hi = highestLevel(Math.max(a, b, c, d), levels)
            for (let L = 1; L <= levels; L++) {
                const drew = cellSegments(a, b, c, d, L / (levels + 1)).length > 0
                if (drew) {
                    expect(L).toBeGreaterThanOrEqual(lo)
                    expect(L).toBeLessThanOrEqual(hi)
                    checked++
                }
            }
        }
        expect(checked).toBeGreaterThan(200)
    })
})
