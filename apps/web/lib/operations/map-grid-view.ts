/**
 * Where the grid is, independent of where Leaflet says the map is.
 *
 * The grid is drawn on a canvas that sits beside Leaflet's panes rather than
 * inside them. During an animated zoom Leaflet does not move the map — it
 * CSS-transforms its panes for a quarter of a second and only updates its own
 * centre and zoom when the animation ends. A canvas that asks the map "where
 * is easting 12000?" mid-animation is told where it *was*, so the grid sat
 * still while the terrain grew underneath it and then jumped into place.
 *
 * So the grid keeps its own view: an affine map from world metres to canvas
 * pixels, which can be interpolated between the view the zoom started from and
 * the one it is heading to, on the same curve Leaflet's transition uses. Pure
 * arithmetic, no Leaflet — the component supplies the two end views.
 */

/** screenX = ax * easting + bx;  screenY = ay * northing + by.
 *  `ay` is negative: north is up, and canvas y grows downwards. */
export interface GridView {
    ax: number
    bx: number
    ay: number
    by: number
    /** The Leaflet zoom this view is at — fractional mid-animation. Decides
     *  which tiers of grid line are drawn. */
    zoom: number
}

type Point = { x: number; y: number }

/**
 * The view for a given centre and zoom.
 *
 * `project` is `map.project(latlng, zoom)` — world to absolute pixels at that
 * zoom. Taking it as a function is what keeps this file free of Leaflet and
 * lets the test stand in a plain CRS.Simple.
 */
export function viewFor(
    project: (lat: number, lng: number, zoom: number) => Point,
    centre: { lat: number; lng: number },
    zoom: number,
    size: Point,
): GridView {
    const c = project(centre.lat, centre.lng, zoom)
    const origin = project(0, 0, zoom)
    const unit = project(1, 1, zoom)
    const ax = unit.x - origin.x
    const ay = unit.y - origin.y
    return {
        ax,
        bx: origin.x - c.x + size.x / 2,
        ay,
        by: origin.y - c.y + size.y / 2,
        zoom,
    }
}

/**
 * The view part-way through a zoom animation.
 *
 * Interpolated in screen space — the coefficients themselves — not in zoom
 * level. That is what a CSS transition between two transforms does, so it is
 * what keeps the lines on the terrain: interpolating zoom linearly instead
 * would trace an exponential scale curve and drift from the map mid-flight.
 */
export function lerpView(from: GridView, to: GridView, t: number): GridView {
    const mix = (a: number, b: number) => a + (b - a) * t
    return {
        ax: mix(from.ax, to.ax),
        bx: mix(from.bx, to.bx),
        ay: mix(from.ay, to.ay),
        by: mix(from.by, to.by),
        zoom: mix(from.zoom, to.zoom),
    }
}

/** The world rectangle a canvas of `size` shows through `view`. */
export function visibleWorld(view: GridView, size: Point) {
    const x0 = (0 - view.bx) / view.ax
    const x1 = (size.x - view.bx) / view.ax
    const y0 = (0 - view.by) / view.ay
    const y1 = (size.y - view.by) / view.ay
    return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1) }
}

/**
 * Leaflet's zoom transition: `cubic-bezier(0, 0, 0.25, 1)` over 250ms
 * (`.leaflet-zoom-anim .leaflet-zoom-animated` in leaflet.css). Both numbers
 * have to match it, or the grid arrives early or late.
 */
export const ZOOM_ANIMATION_MS = 250

/**
 * Progress along that curve for elapsed fraction `x` in [0, 1].
 *
 * With control points (0,0) and (0.25,1) the curve is
 *   X(s) = 0.75 s²(1 − s) + s³,   Y(s) = 3 s²(1 − s) + s³,
 * and X is monotonic, so s is found by bisection and Y read off.
 */
export function zoomEase(x: number): number {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const X = (s: number) => 3 * (1 - s) * s * s * 0.25 + s * s * s
    const Y = (s: number) => 3 * (1 - s) * s * s + s * s * s
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (X(mid) < x) lo = mid
        else hi = mid
    }
    return Y((lo + hi) / 2)
}
