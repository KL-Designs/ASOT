import { describe, test, expect } from 'vitest'
import path from 'path'

import { THUMB_DIR } from './paths'
import {
    FEATURED_THUMB_WIDTH, FEATURED_WIDE_THUMB_WIDTH, parseThumbWidth,
    THUMB_WIDTH, THUMB_WIDTHS, thumbFallbackUrl, thumbPath, thumbUrl,
} from './thumbs'

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

    /* Now that three widths are live at once, the width in the filename is what
       stops a featured tile being handed the grid's 400px thumbnail — the two
       requests differ in nothing else the cache looks at. */
    test('gives every width its own cache file', () => {
        const paths = THUMB_WIDTHS.map(w => thumbPath(ID, w))
        expect(new Set(paths).size).toBe(THUMB_WIDTHS.length)
        for (const width of THUMB_WIDTHS) {
            expect(thumbPath(ID, width)).toBe(path.join(THUMB_DIR, `${ID}-${width}.webp`))
        }
    })

    test('still refuses a bad id whatever width is asked for', () => {
        for (const width of THUMB_WIDTHS) {
            expect(thumbPath('../../../.env', width)).toBeNull()
        }
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

/* The allow-list is the disk-cache guard, not a nicety: every distinct width is
   a file written into storage/gallery/thumbs and never evicted, so a free `?w=`
   integer would let an anonymous visitor fill the volume from one media id. */
describe('parseThumbWidth', () => {
    test('accepts each width on the list', () => {
        for (const width of THUMB_WIDTHS) {
            expect(parseThumbWidth(String(width))).toBe(width)
        }
    })

    test('falls back to the default for anything else', () => {
        for (const bad of [
            null, undefined, '', '401', '399', '640', '1601', '100000', '-400',
            '400.5', '4e2', 'four hundred', '400px', '0x190', ' 400 ; rm -rf /',
            'Infinity', 'NaN',
        ]) {
            expect(parseThumbWidth(bad)).toBe(THUMB_WIDTH)
        }
    })

    /* ' 400 ' is deliberately NOT in the list above: Number() trims whitespace,
       so it really is 400, and the value that reaches a filename is the parsed
       number rather than the raw string. That is the property that matters —
       nothing but a member of the union is ever interpolated. */
    test('interpolates the parsed number, never the caller’s string', () => {
        expect(THUMB_WIDTHS).toContain(parseThumbWidth(' 400 '))
    })
})

describe('thumbUrl', () => {
    // One URL per size. The default is spelled without a parameter so the J5
    // grid's existing URLs keep meaning the same bytes and two spellings of the
    // 400px thumbnail don't both occupy every browser cache.
    test('omits the query parameter for the default width', () => {
        expect(thumbUrl(ID)).toBe(`/api/gallery/media/${ID}/thumb`)
        expect(thumbUrl(ID, THUMB_WIDTH)).toBe(`/api/gallery/media/${ID}/thumb`)
    })

    test('asks for a larger width explicitly', () => {
        expect(thumbUrl(ID, FEATURED_THUMB_WIDTH)).toBe(`/api/gallery/media/${ID}/thumb?w=800`)
        expect(thumbUrl(ID, FEATURED_WIDE_THUMB_WIDTH)).toBe(`/api/gallery/media/${ID}/thumb?w=1600`)
    })

    // Whatever the surfaces choose, the route has to be willing to serve it.
    test('only ever names a width the route will accept', () => {
        for (const width of [THUMB_WIDTH, FEATURED_THUMB_WIDTH, FEATURED_WIDE_THUMB_WIDTH]) {
            expect(THUMB_WIDTHS).toContain(width)
        }
    })
})
