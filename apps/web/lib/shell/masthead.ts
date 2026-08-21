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
 * display saw a photograph and a title before any content. Clamping fixed
 * that but overshot — the band came out shallower than the photography it
 * carries deserves — so the whole scale has since been lifted by roughly a
 * quarter. `md`'s 440px ceiling plus the navbar is still under half a 1080p
 * viewport, which is the property worth keeping: responsive, and never
 * eating the fold.
 */
const HEIGHTS: Record<BannerHeight, string> = {
    xsm: 'clamp(140px, 20vh, 190px)',
    sm: 'clamp(210px, 30vh, 320px)',
    md: 'clamp(290px, 42vh, 440px)',
    lg: 'clamp(350px, 52vh, 540px)',
}

export function bannerHeightValue(size?: BannerHeight): string {
    return HEIGHTS[size ?? 'md']
}
