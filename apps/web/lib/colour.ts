/**
 * One home for hex -> rgb. It was previously redefined in at least three
 * files (the editor page, PageSidebar, PageNavClient), each with the same
 * body, which is how two of them ended up disagreeing about what to do with
 * a malformed value.
 */
export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
    const h = String(hex ?? '').replace('#', '')
    if (h.length !== 6) return { r: 219, g: 0, b: 29 }
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

/** `"219,0,29"` — the form CSS custom properties want for rgba() tinting. */
export function rgbTriplet(hex: string): string {
    const { r, g, b } = hexToRgb(hex)
    return `${r},${g},${b}`
}
