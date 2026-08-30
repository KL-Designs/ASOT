import path from 'path'

import { FEATURED_DIR } from './paths'

/**
 * Resolving a featured image's filename to a path on disk.
 *
 * This exists because the route it serves did not do it. It interpolated the
 * `?img=` query parameter straight into a template string, so
 * `?img=../../../.env` resolved to the repository-root .env and served
 * MONGO_URI and DISCORD_TOKEN over an unauthenticated endpoint.
 *
 * Two independent checks, deliberately. The character class is the one that
 * actually decides, and the containment assertion below it is belt and braces
 * over anything the class fails to anticipate — the same pattern
 * `resolveStorageKey` uses for media keys.
 */

export { FEATURED_DIR }

/** A plain image filename: no separators, no traversal, no control characters. */
const FEATURED_FILE = /^[A-Za-z0-9][A-Za-z0-9 ._'()-]*\.(jpe?g|png|webp|gif)$/i

export function resolveFeaturedImage(img: string | null | undefined): string | null {
    if (!img) return null
    if (!FEATURED_FILE.test(img)) return null
    // Redundant given the class above, and kept anyway: these two are the
    // names a filename regex is most often written to allow by accident.
    if (img === '.' || img === '..') return null

    const resolved = path.resolve(FEATURED_DIR, img)
    return resolved.startsWith(FEATURED_DIR + path.sep) ? resolved : null
}
