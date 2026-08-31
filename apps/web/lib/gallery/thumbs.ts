import path from 'path'

import { THUMB_DIR } from './paths'

/**
 * The grid's thumbnails: how big they are, and where a cached one lives.
 *
 * The Media tab used to hand every tile the full-size original. On the live
 * archive that is 4,781 files averaging 3.8MB, sixty to a page — roughly 200MB
 * pulled through an API route to fill tiles about 178px wide, with the browser
 * downscaling sixty 4K screenshots on top. The lag reported in that tab was the
 * bytes, not the rendering.
 *
 * 400px wide because the tile is `minmax(150px, 1fr)` and the centre column
 * rarely gives one more than ~200px: 400 covers a 2x display without paying for
 * a size nothing shows. WebP at quality 72 because these are screenshots shown
 * at a fifth of their size — the artefacts a photographer would object to are
 * below the resolution the tile can display, and the same frame lands around
 * 25KB instead of 3.8MB.
 *
 * The path logic is separated from the route that serves it for the usual two
 * reasons: a route file under `typedRoutes` may export nothing but handlers, so
 * anything worth testing has to live here, and every filesystem path in this
 * feature is derived rather than concatenated (see featured-path.ts for what
 * concatenating one cost this repository).
 */

export const THUMB_WIDTH = 400
export const THUMB_QUALITY = 72

/** A media id as this application writes it: the 24-character hex of an
 *  ObjectId, nothing else. The route has already run ObjectId.isValid on it;
 *  this is the check that actually stands between the id and a filename,
 *  because isValid also accepts a 12-byte string and would let a separator
 *  through. */
const MEDIA_ID = /^[0-9a-f]{24}$/

/**
 * The cache file for one media id, or null if the id does not name one safely.
 *
 * The width is in the filename on purpose. The cached file is only invalidated
 * against the source's mtime, so raising THUMB_WIDTH would otherwise keep
 * serving yesterday's narrower thumbnails forever — the source has not changed,
 * so nothing would ever look stale. A new width is a new filename and therefore
 * a cold cache, which is the correct behaviour and costs one regeneration.
 *
 * The containment assertion after path.resolve is belt and braces over the
 * regex above, the same pairing resolveStorageKey and resolveFeaturedImage use.
 */
export function thumbPath(id: string): string | null {
    if (!MEDIA_ID.test(id)) return null

    const resolved = path.resolve(THUMB_DIR, `${id}-${THUMB_WIDTH}.webp`)
    return resolved.startsWith(THUMB_DIR + path.sep) ? resolved : null
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
