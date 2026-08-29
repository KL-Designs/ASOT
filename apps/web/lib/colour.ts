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

/* ── Contrast ─────────────────────────────────────────────────────────────
 *
 * The operation's theme colour is chosen by whoever made the operation, from a
 * picker with no opinion about legibility — and two page themes want to use it
 * as *ink*. ASOT red (#db001d) is 3.87:1 on the Sci-Fi console's glass, which
 * fails AA outright, and a pale accent on Cold War's paper is worse still.
 *
 * So the accent gets normalised before it is allowed to be text: keep the hue,
 * move the lightness until it clears a stated ratio against the ground it will
 * sit on. The operation's colour still reads as itself — hue is what people
 * recognise — and the page stays readable whatever was picked.
 */

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
    const channel = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(hexToRgb(a))
    const lb = relativeLuminance(hexToRgb(b))
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

export interface Hsl { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
    const { r, g, b } = hexToRgb(hex)
    const [rn, gn, bn] = [r / 255, g / 255, b / 255]
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l }

    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    const h = max === rn
        ? ((gn - bn) / d + (gn < bn ? 6 : 0))
        : max === gn
            ? (bn - rn) / d + 2
            : (rn - gn) / d + 4
    return { h: (h * 60 + 360) % 360, s, l }
}

export function hslToHex({ h, s, l }: Hsl): string {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    const [r1, g1, b1] =
        h < 60 ? [c, x, 0] :
        h < 120 ? [x, c, 0] :
        h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] :
        h < 300 ? [x, 0, c] : [c, 0, x]
    const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
    return `#${hex(r1)}${hex(g1)}${hex(b1)}`
}

/**
 * The same colour, moved until it is readable on `ground`.
 *
 * Hue is held and lightness is walked — towards white on a dark ground,
 * towards black on a light one — in 1% steps until the ratio clears, which is
 * a search rather than a formula because the luminance curve is not linear in
 * HSL lightness and a closed form for "which L gives ratio R at this hue" is
 * more machinery than 100 iterations of the real thing.
 *
 * Saturation is floored, not preserved: a near-grey accent walked towards
 * white just becomes white, and the operation stops being recognisable. It is
 * only raised, never cut, so a vivid accent stays as vivid as it arrived.
 *
 * Returns the best it managed if the ratio is unreachable — some hues cannot
 * hit 7:1 on a mid grey at any lightness, and a slightly-too-low accent is a
 * better answer than a black one.
 */
export function readableOn(hex: string, ground: string, minRatio = 4.5, minSaturation = 0.45): string {
    let best = hex
    let bestRatio = contrastRatio(hex, ground)
    // Already legible: hand it back untouched. Nudging a colour that was fine
    // is how "keep the operation's accent" quietly becomes "keep its hue".
    if (bestRatio >= minRatio) return hex

    const { h, s } = hexToHsl(hex)
    const sat = Math.max(s, minSaturation)
    const groundIsDark = relativeLuminance(hexToRgb(ground)) < 0.18

    for (let step = 0; step <= 100; step++) {
        const l = groundIsDark ? step / 100 : 1 - step / 100
        const candidate = hslToHex({ h, s: sat, l })
        const ratio = contrastRatio(candidate, ground)
        if (ratio > bestRatio) { best = candidate; bestRatio = ratio }
        // Walking outward from the ground, so the first pass is the closest
        // colour that clears — the most saturated one still recognisable as
        // the accent rather than a tint of it.
        if (ratio >= minRatio) return candidate
    }

    return best
}
