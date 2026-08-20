/**
 * Pure helpers for the public page masthead.
 *
 * These live in lib/ rather than beside the component because vitest is
 * configured to pick up `lib/**\/*.test.ts` and nothing else — logic that
 * matters is logic that can be tested.
 */

export type BannerHeight = 'xsm' | 'sm' | 'md' | 'lg'

/**
 * The band's height, as a CSS value.
 *
 * These replace the `vh`-only heights in tailwind.config.ts. `md` was
 * `60vh` on desktop, which with the 94px navbar meant a reader on a 1080p
 * display saw a photograph and a title before any content. The clamps keep
 * the band responsive without letting it eat the viewport.
 */
const HEIGHTS: Record<BannerHeight, string> = {
    xsm: 'clamp(110px, 16vh, 150px)',
    sm: 'clamp(170px, 24vh, 250px)',
    md: 'clamp(230px, 34vh, 340px)',
    lg: 'clamp(280px, 44vh, 420px)',
}

export function bannerHeightValue(size?: BannerHeight): string {
    return HEIGHTS[size ?? 'md']
}

/**
 * The last-resort kicker: the final path segment, de-slugged and title-cased.
 *
 * Deliberately dumb. A page that wants "About the unit" over `/about` passes
 * `kicker` explicitly; this only exists so a page that passes nothing still
 * gets something truthful rather than an empty rule.
 */
export function kickerFromPath(pathname: string): string {
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) return 'ASOT'

    return last
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}
