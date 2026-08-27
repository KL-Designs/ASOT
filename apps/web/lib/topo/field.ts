/**
 * The contour field behind `components/ui/Topo`.
 *
 * The backdrop used to be a static SVG of contour lines translated sideways —
 * cheap, but nothing about a picture of contours can warp, because the lines
 * are baked into the file. These two functions generate them instead: sample a
 * noise field whose third axis is time, then trace the isolines. Contours can
 * then do what real ones do as terrain moves — stretch, pinch, split in two,
 * and close into a ring as a peak rises past a threshold.
 *
 * Pure and here in lib/ rather than beside the component because vitest picks
 * up `lib/**\/*.test.ts` and nothing else, and the marching-squares saddle
 * cases are exactly the sort of thing that fails silently and looks like a
 * rendering glitch.
 */

/**
 * Integer-hash value noise. Cheaper than simplex and indistinguishable from it
 * once it has been through four octaves and a contour tracer — the tracer only
 * ever sees level crossings, not the field itself.
 */
function hash(x: number, y: number, z: number): number {
    let n = (x * 374761393 + y * 668265263 + z * 1274126177) | 0
    n = ((n ^ (n >>> 13)) * 1274126177) | 0
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/** Quintic fade. Smoother than cubic at the cell edges, which contours show up. */
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function noise3(x: number, y: number, z: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi)

    const c000 = hash(xi, yi, zi), c100 = hash(xi + 1, yi, zi)
    const c010 = hash(xi, yi + 1, zi), c110 = hash(xi + 1, yi + 1, zi)
    const c001 = hash(xi, yi, zi + 1), c101 = hash(xi + 1, yi, zi + 1)
    const c011 = hash(xi, yi + 1, zi + 1), c111 = hash(xi + 1, yi + 1, zi + 1)

    return lerp(
        lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
        lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
        zf,
    )
}

/**
 * Four octaves, weights summing to 1 so the result stays in 0..1 and contour
 * levels can be spaced evenly across it. Time advances faster on the finer
 * octaves: the broad landforms drift while the detail on them churns, which is
 * what stops the whole field reading as one sliding sheet.
 */
export function fbm3(x: number, y: number, z: number): number {
    return noise3(x, y, z) * 0.5333
        + noise3(x * 2.03, y * 2.03, z * 1.7) * 0.2667
        + noise3(x * 4.01, y * 4.01, z * 2.6) * 0.1333
        + noise3(x * 8.07, y * 8.07, z * 3.9) * 0.0667
}

/**
 * Marching squares for one cell, in unit coordinates.
 *
 * Corners are `a` top-left, `b` top-right, `c` bottom-right, `d` bottom-left.
 * Returns a flat `x0, y0, x1, y1` per segment — flat rather than tupled because
 * this runs tens of thousands of times a frame and every array allocation shows
 * up.
 *
 * The saddle cases (two opposite corners above the level) are the only ones the
 * corners do not settle on their own: the contours can join either way, and the
 * cell centre breaks the tie. Picking arbitrarily produces crossed lines, which
 * never occur on a real contour map and read immediately as a bug.
 */
export function cellSegments(a: number, b: number, c: number, d: number, level: number): number[] {
    let idx = 0
    if (a > level) idx |= 8
    if (b > level) idx |= 4
    if (c > level) idx |= 2
    if (d > level) idx |= 1
    if (idx === 0 || idx === 15) return []

    // Crossing points along each edge, computed only where they are used.
    const top = () => (level - a) / (b - a)
    const right = () => (level - b) / (c - b)
    const bottom = () => (level - d) / (c - d)
    const left = () => (level - a) / (d - a)

    switch (idx) {
        case 1: case 14: return [0, left(), bottom(), 1]
        case 2: case 13: return [bottom(), 1, 1, right()]
        case 3: case 12: return [0, left(), 1, right()]
        case 4: case 11: return [top(), 0, 1, right()]
        case 6: case 9: return [top(), 0, bottom(), 1]
        case 7: case 8: return [0, left(), top(), 0]

        case 5: return (a + b + c + d) / 4 > level
            ? [0, left(), top(), 0, bottom(), 1, 1, right()]
            : [0, left(), bottom(), 1, top(), 0, 1, right()]

        case 10: return (a + b + c + d) / 4 > level
            ? [0, left(), bottom(), 1, top(), 0, 1, right()]
            : [0, left(), top(), 0, bottom(), 1, 1, right()]

        default: return []
    }
}
