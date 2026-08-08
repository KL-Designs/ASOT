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