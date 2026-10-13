/**
 * The Screenshot of the Month's focal point.
 *
 * The same photograph is cropped three different ways — a very wide band
 * behind the home page hero, a short wide panel in the gallery header, and the
 * masthead of the join page — and all three used to crop to the centre. A
 * screenshot whose subject sits off-centre lost it in at least one of them.
 *
 * J5 marks the point that matters, stored as percentages of the image's width
 * and height, and every crop is anchored on it with `object-position`.
 *
 * Imports nothing: the API route validates with it and client components
 * render with it.
 */

/** A percentage in [0, 100], rounded to one decimal — or null when the value
 *  is not a finite number at all. */
export function clampFocal(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

/**
 * The `object-position` for a pick, or undefined to leave the browser's
 * default (centre) alone.
 *
 * Both coordinates or neither: half a focal point is a corrupt record, and
 * anchoring one axis on it while centring the other would look deliberate.
 */
export function focalPosition(sotm: { focalX?: number; focalY?: number } | null | undefined): string | undefined {
    const x = clampFocal(sotm?.focalX)
    const y = clampFocal(sotm?.focalY)
    if (x === null || y === null) return undefined
    return `${x}% ${y}%`
}
