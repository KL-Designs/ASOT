export default function convertColorToHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}

/** Ensures an accent hex colour is bright enough to be visible on a dark background.
 *  - Near-black → grey fallback
 *  - Too dark → lightened to the minimum luminance threshold
 */
export function ensureVisible(hex: string, minLuminance = 0.25): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255

    // Relative luminance (WCAG formula)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    if (lum < 0.01) return '#888888'  // near-black → grey
    if (lum >= minLuminance) return hex

    // Scale each channel up proportionally until luminance meets the threshold
    const scale = Math.sqrt(minLuminance / lum)
    const clamp = (v: number) => Math.min(255, Math.round(v * 255 * scale))
    const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** The channel triplet of an accent hex, as `"212,160,58"`.
 *
 *  For CSS custom properties: the milpac profile tints with
 *  `rgba(var(--acc-rgb), .12)` throughout, which needs the channels separately
 *  rather than a colour. Returns mid-grey for anything unparseable so a bad
 *  stored value degrades to a readable page rather than an invalid rule that
 *  takes every tint with it.
 */
export function hexToRgbTriplet(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return '136,136,136'
    const n = parseInt(m[1], 16)
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}