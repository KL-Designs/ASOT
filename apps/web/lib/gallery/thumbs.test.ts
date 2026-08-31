import { describe, test, expect } from 'vitest'
import path from 'path'

import { THUMB_DIR } from './paths'
import { THUMB_WIDTH, thumbFallbackUrl, thumbPath } from './thumbs'

const ID = '65b3f0a1c2d4e5f60718293a'

describe('thumbPath', () => {
    test('names a file directly inside the thumbnail directory', () => {
        expect(thumbPath(ID)).toBe(path.join(THUMB_DIR, `${ID}-${THUMB_WIDTH}.webp`))
    })

    /* The width is in the filename so that raising THUMB_WIDTH cannot keep
       serving yesterday's narrower thumbnails: the cache is invalidated against
       the SOURCE's mtime, and the source does not change when a constant does. */
    test('puts the width in the filename', () => {
        expect(thumbPath(ID)).toContain(`-${THUMB_WIDTH}.webp`)
    })

    /* This is the only thing between a request path segment and a filename.
       featured-path.ts exists because a route once concatenated one of these
       instead, and `?img=../../../.env` served MONGO_URI over an
       unauthenticated endpoint. */
    test('refuses anything that is not a 24-character ObjectId hex', () => {
        for (const bad of [
            '',
            '..',
            '../../../.env',
            '..\\..\\.env',
            '/etc/passwd',
            `${ID}/../../.env`,
            `${ID}.png`,
            ID.toUpperCase(),      // resolveStorageKey's MEDIA_FILE is lowercase-only too
            ID.slice(0, 23),
            `${ID}a`,
            'zzzzzzzzzzzzzzzzzzzzzzzz',
            'hello world',
        ]) {
            expect(thumbPath(bad)).toBeNull()
        }
    })
})

describe('thumbFallbackUrl', () => {
    // A video's thumbnail is made from its poster, so a failed resize has to
    // fall back to the poster route rather than to the whole clip.
    test('sends a poster-sourced thumbnail to the poster route', () => {
        expect(thumbFallbackUrl(ID, true)).toBe(`/api/gallery/media/${ID}/poster`)
    })

    test('sends an image to the media route', () => {
        expect(thumbFallbackUrl(ID, false)).toBe(`/api/gallery/media/${ID}`)
    })

    // Same validation as thumbPath: a fallback URL is interpolated into a
    // redirect, and an unvalidated id would put whatever was in the request
    // path into a Location header.
    test('refuses an id it would not build a path for', () => {
        expect(thumbFallbackUrl('../../evil', false)).toBeNull()
        expect(thumbFallbackUrl('', true)).toBeNull()
    })
})
