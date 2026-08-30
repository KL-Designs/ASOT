import path from 'path'

/**
 * The only thing between a storageKey and the filesystem.
 *
 * Two trees, because the migration moved no bytes: everything that predates
 * submissions still sits in the nested content tree the old gallery walked, and
 * everything submitted since sits flat under media/, addressed by its own
 * ObjectId. The key's prefix says which.
 *
 * Flat storage for new media is a security property as much as a tidiness one.
 * `/api/gallery/fetch` has to validate four user-supplied path segments against
 * a character class and then re-check the resolved path, because a member picks
 * those segments. A media id is a 24-character hex string this application
 * generated, so the check is one regex — and the containment assertion below is
 * belt and braces over that.
 *
 * Paths are relative to apps/web's working directory, matching every other
 * storage path in this codebase.
 */

const GALLERY_ROOT = path.resolve('../../storage/gallery')

export const CONTENT_DIR = path.join(GALLERY_ROOT, 'content')
export const MEDIA_DIR = path.join(GALLERY_ROOT, 'media')
export const STAGING_DIR = path.join(GALLERY_ROOT, 'staging')
export const FEATURED_DIR = path.join(GALLERY_ROOT, 'featured')
export const SOTM_DIR = path.join(GALLERY_ROOT, 'sotm')

/** A media filename this application wrote: an ObjectId hex, an optional
 *  _poster suffix, and an extension. Nothing else. */
const MEDIA_FILE = /^[0-9a-f]{24}(_poster)?\.[a-z0-9]{2,5}$/

export function mediaKey(id: string, ext: string): string {
    return `media:${id}.${ext.replace(/^\./, '').toLowerCase()}`
}

export function posterKey(id: string): string {
    return `media:${id}_poster.jpg`
}

/** The absolute path this key names, or null if it does not name one safely. */
export function resolveStorageKey(key: string): string | null {
    if (!key) return null

    if (key.startsWith('media:')) {
        const file = key.slice('media:'.length)
        if (!MEDIA_FILE.test(file)) return null
        const resolved = path.resolve(MEDIA_DIR, file)
        return resolved.startsWith(MEDIA_DIR + path.sep) ? resolved : null
    }

    if (key.startsWith('legacy:')) {
        const rest = key.slice('legacy:'.length)
        if (!rest) return null
        const segments = rest.split('/')
        // Four segments exactly — year, operation, mission, file — and none of
        // them may be a traversal or empty.
        if (segments.length !== 4) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null
        const resolved = path.resolve(CONTENT_DIR, ...segments)
        return resolved.startsWith(CONTENT_DIR + path.sep) ? resolved : null
    }

    return null
}
