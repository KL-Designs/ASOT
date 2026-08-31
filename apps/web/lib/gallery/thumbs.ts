import path from 'path'

import { THUMB_DIR } from './paths'

/**
 * The gallery's downscaled images: which sizes exist, and where a cached one
 * lives.
 *
 * The Media tab used to hand every tile the full-size original. On the live
 * archive that is 4,781 files averaging 3.8MB, sixty to a page — roughly 200MB
 * pulled through an API route to fill tiles about 178px wide, with the browser
 * downscaling sixty 4K screenshots on top. The lag reported in that tab was the
 * bytes, not the rendering.
 *
 * WebP at quality 72 throughout, because these are screenshots shown well under
 * their native size — the artefacts a photographer would object to are below
 * the resolution the tile can display, and a 3.8MB frame lands around 25KB at
 * 400px.
 *
 * THE SIZES ARE AN ALLOW-LIST, and that is a security property, not tidiness.
 * Every distinct width is a new file written into `storage/gallery/thumbs`,
 * generated on first request and kept. A free `?w=` integer would therefore be
 * a resize-on-demand endpoint any anonymous visitor can point at a live media
 * id in a loop — a few thousand requests fills the bind-mounted volume with
 * thumbnails nothing will ever read again, and nothing in this codebase evicts
 * them. Three widths means at most three files per item, forever.
 *
 *   400  — a J5 Media grid tile (`minmax(150px, 1fr)`, rarely wider than
 *          ~200px in the centre column). Covers a 2x display without paying for
 *          a size nothing shows.
 *   800  — the public featured rail's tiles (280x158 CSS px, so 560 at 2x) and
 *          the home page mosaic's single-column tiles (~341px at a 1400px
 *          `.inner`, so 682 at 2x).
 *  1600  — the home page mosaic's double-width tiles (~694 CSS px at a 1400px
 *          `.inner`, so 1388 at 2x). These are the largest photographs the
 *          public site renders outside the lightbox, which keeps the original.
 *
 * The path logic is separated from the route that serves it for the usual two
 * reasons: a route file under `typedRoutes` may export nothing but handlers, so
 * anything worth testing has to live here, and every filesystem path in this
 * feature is derived rather than concatenated (see featured-path.ts for what
 * concatenating one cost this repository).
 */

/** Every width this application will ever resize to. Written as a union rather
 *  than inferred from the array so a caller cannot pass an arbitrary number and
 *  only find out at runtime. */
export type ThumbWidth = 400 | 800 | 1600

export const THUMB_WIDTHS: readonly ThumbWidth[] = [400, 800, 1600]

/** The default, and what a request with no `w` gets: the J5 grid tile size this
 *  module was built for. Unchanged from when it was the only size, so every URL
 *  already in a page or a browser cache still means the same bytes. */
export const THUMB_WIDTH: ThumbWidth = 400

/** The public featured rail (`FeaturedRail.tsx`) and the home page mosaic's
 *  single-column tiles. */
export const FEATURED_THUMB_WIDTH: ThumbWidth = 800

/** The home page mosaic's double-width tiles (`GalleryStrip.tsx`). */
export const FEATURED_WIDE_THUMB_WIDTH: ThumbWidth = 1600

export const THUMB_QUALITY = 72

/** A media id as this application writes it: the 24-character hex of an
 *  ObjectId, nothing else. The route has already run ObjectId.isValid on it;
 *  this is the check that actually stands between the id and a filename,
 *  because isValid also accepts a 12-byte string and would let a separator
 *  through. */
const MEDIA_ID = /^[0-9a-f]{24}$/

/**
 * The width a `?w=` query parameter asks for, or the default.
 *
 * Anything not in the allow-list — a width between two of them, a huge one, a
 * negative, a float, a word — silently becomes THUMB_WIDTH rather than a 400
 * response. There is no attacker to inform and no caller to correct: the only
 * thing a rejection would achieve is a broken image where a slightly-wrong-size
 * one would do. What matters is only that an unknown width can never reach
 * sharp or a filename, which is what this guarantees.
 */
export function parseThumbWidth(raw: string | null | undefined): ThumbWidth {
    if (!raw) return THUMB_WIDTH
    const value = Number(raw)
    for (const width of THUMB_WIDTHS) {
        if (width === value) return width
    }
    return THUMB_WIDTH
}

/**
 * The cache file for one media id at one width, or null if the id does not name
 * one safely.
 *
 * The width is in the filename on purpose. The cached file is only invalidated
 * against the source's mtime, so a single filename shared between widths would
 * serve whichever size happened to be generated first to every request
 * afterwards — the source has not changed, so nothing would ever look stale.
 * A new width is a new filename and therefore a cold cache, which is the
 * correct behaviour and costs one regeneration. That was already true when
 * raising a single THUMB_WIDTH was the only way to change the size; with three
 * live widths it is what keeps a rail tile from being served a grid thumbnail.
 *
 * The containment assertion after path.resolve is belt and braces over the
 * regex above and the ThumbWidth union, the same pairing resolveStorageKey and
 * resolveFeaturedImage use.
 */
export function thumbPath(id: string, width: ThumbWidth = THUMB_WIDTH): string | null {
    if (!MEDIA_ID.test(id)) return null

    const resolved = path.resolve(THUMB_DIR, `${id}-${width}.webp`)
    return resolved.startsWith(THUMB_DIR + path.sep) ? resolved : null
}

/**
 * The URL a page should point an `<img>` at for one media id at one width.
 *
 * The default width is emitted WITHOUT a `?w=`, so there is exactly one URL per
 * size rather than two spellings of the 400px one competing for space in every
 * browser cache — and so the J5 grid's existing URLs are unchanged.
 */
export function thumbUrl(id: string, width: ThumbWidth = THUMB_WIDTH): string {
    const base = `/api/gallery/media/${id}/thumb`
    return width === THUMB_WIDTH ? base : `${base}?w=${width}`
}

/** Where the thumbnail route sends a client when it cannot produce a thumbnail.
 *  Degrading to the original means slow, which is what this feature set out to
 *  fix; degrading to nothing means a grid of grey boxes, which is worse than
 *  what it replaced. `poster` picks the sibling route that serves the still
 *  frame, since that is the source a video's thumbnail is made from. */
export function thumbFallbackUrl(id: string, poster: boolean): string | null {
    if (!MEDIA_ID.test(id)) return null
    return poster ? `/api/gallery/media/${id}/poster` : `/api/gallery/media/${id}`
}
