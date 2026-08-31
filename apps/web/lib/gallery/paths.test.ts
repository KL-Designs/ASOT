import { describe, test, expect } from 'vitest'
import path from 'path'

import {
    CONTENT_DIR, FEATURED_DIR, MEDIA_DIR, SOTM_DIR,
    contentKey, mediaKey, posterKey, resolveStorageKey,
} from './paths'

describe('contentKey', () => {
    test('prefixes a relative path', () => {
        expect(contentKey('2021/4. Op Silent Ridge/I/x.png')).toBe('content:2021/4. Op Silent Ridge/I/x.png')
    })
})

describe('resolveStorageKey — content', () => {
    /* The campaign grammar's own depth. Every gallery route resolves its bytes
       through resolveStorageKey, so a cap left at four here would have made
       every campaign item 404 while its database record looked perfectly
       healthy — the failure would show as broken tiles, not as an error. */
    test('five segments — a campaign mission under its day folder', () => {
        expect(resolveStorageKey('content:2026/1. Op Trinity/Operation Trinity I/Saturday/x.jpg'))
            .toBe(path.join(CONTENT_DIR, '2026', '1. Op Trinity', 'Operation Trinity I', 'Saturday', 'x.jpg'))
    })

    test('four segments', () => {
        expect(resolveStorageKey('content:2021/4. Op Silent Ridge/I/x.png'))
            .toBe(path.join(CONTENT_DIR, '2021', '4. Op Silent Ridge', 'I', 'x.png'))
    })

    test('three segments', () => {
        expect(resolveStorageKey('content:2026/23. Op New Winter/y.mp4'))
            .toBe(path.join(CONTENT_DIR, '2026', '23. Op New Winter', 'y.mp4'))
    })

    test('two segments under Unknown', () => {
        expect(resolveStorageKey('content:Unknown/z.jpg')).toBe(path.join(CONTENT_DIR, 'Unknown', 'z.jpg'))
    })

    test('a filename containing spaces, an em dash and a bracketed id', () => {
        const key = 'content:2026/23. Op New Winter/Koda — Danger close [6a9380f11c4e5d2a77b31099].jpg'
        expect(resolveStorageKey(key)).toContain('Danger close [6a9380f11c4e5d2a77b31099].jpg')
    })

    test('legacy: is still accepted and resolves to the same place', () => {
        expect(resolveStorageKey('legacy:2021/4. Op Silent Ridge/I/x.png'))
            .toBe(resolveStorageKey('content:2021/4. Op Silent Ridge/I/x.png'))
    })

    // Restored from the pre-existing test file (commit 5b5b97a7), which this
    // task's brief overwrote wholesale. Kept alongside the newer assertions
    // above rather than folded into them, per the fix-round instruction to
    // preserve both sets rather than pick a winner on a containment boundary.
    test('a legacy key resolves inside the content directory', () => {
        const resolved = resolveStorageKey('legacy:2025/1. Op Black Hill/I/a.png')
        expect(resolved?.startsWith(CONTENT_DIR + path.sep)).toBe(true)
    })

    test('refuses traversal, empty segments and too many segments', () => {
        for (const bad of [
            'content:../../.env',
            'content:2021/../../../.env',
            'content:2021/./x.png',
            'content:2021//x.png',
            'content:2021\\4. Op\\x.png',
            'content:x.png',
            // Six: one level deeper than the campaign grammar can produce.
            'content:a/b/c/d/e/f.png',
            'content:2026/1. Op Trinity/Operation Trinity I/Saturday/../../../.env',
            'content:',
        ]) {
            expect(resolveStorageKey(bad), bad).toBeNull()
        }
    })
})

describe('resolveStorageKey — media, featured, sotm', () => {
    test('media keys are unchanged', () => {
        const id = '6a9380f11c4e5d2a77b31099'
        expect(resolveStorageKey(mediaKey(id, 'mp4'))).toBe(path.join(MEDIA_DIR, `${id}.mp4`))
        expect(resolveStorageKey(posterKey(id))).toBe(path.join(MEDIA_DIR, `${id}_poster.jpg`))
    })

    test('featured and sotm accept a plain filename', () => {
        expect(resolveStorageKey('featured:shot-01.jpg')).toBe(path.join(FEATURED_DIR, 'shot-01.jpg'))
        expect(resolveStorageKey('sotm:june.png')).toBe(path.join(SOTM_DIR, 'june.png'))
    })

    test('featured and sotm refuse anything but a plain filename', () => {
        for (const bad of ['featured:../.env', 'featured:sub/x.jpg', 'featured:..', 'sotm:../../.env', 'featured:']) {
            expect(resolveStorageKey(bad), bad).toBeNull()
        }
    })

    test('an unknown prefix is null, not a path', () => {
        expect(resolveStorageKey('secrets:.env')).toBeNull()
        expect(resolveStorageKey('/etc/passwd')).toBeNull()
        expect(resolveStorageKey('')).toBeNull()
    })

    /* Restored from the pre-existing test file (commit 5b5b97a7). That file
       was overwritten wholesale by this task's original brief, which silently
       dropped this coverage of the `media:` branch's containment check
       (`MEDIA_FILE`) — a future weakening of that regex would otherwise pass
       every test in this file. Kept verbatim, including the mix of `media:`
       and `legacy:` cases in the two test.each blocks below, so the restored
       assertions match exactly what was lost rather than an approximation. */
    test('a media key resolves inside the media directory', () => {
        const resolved = resolveStorageKey('media:507f1f77bcf86cd799439011.jpg')
        expect(resolved?.startsWith(MEDIA_DIR + path.sep)).toBe(true)
        expect(resolved?.endsWith('507f1f77bcf86cd799439011.jpg')).toBe(true)
    })

    test.each([
        'media:../../../etc/passwd',
        'legacy:../../secrets/.env',
        'legacy:2025/../../../etc/passwd',
        'media:..%2F..%2Fetc%2Fpasswd',
        'media:/etc/passwd',
        'legacy:2025/op/I/../../../../.env',
    ])('refuses traversal — %s', key => {
        expect(resolveStorageKey(key)).toBeNull()
    })

    test.each([
        '',
        'no-prefix.jpg',
        'unknown:thing.jpg',
        'media:',
        'legacy:',
        'media:file .jpg',
    ])('refuses a malformed key — %s', key => {
        expect(resolveStorageKey(key)).toBeNull()
    })

    test('a media key must be an ObjectId hex plus an extension', () => {
        // Anything else did not come from this application.
        expect(resolveStorageKey('media:notanobjectid.jpg')).toBeNull()
        expect(resolveStorageKey('media:507f1f77bcf86cd799439011')).toBeNull()
        expect(resolveStorageKey('media:507f1f77bcf86cd799439011_poster.jpg')).not.toBeNull()
    })
})

describe('key builders', () => {
    // Restored from the pre-existing test file (commit 5b5b97a7) — see the
    // note above the media-key tests in the previous describe block.
    test('round-trip through resolveStorageKey', () => {
        const id = '507f1f77bcf86cd799439011'
        expect(resolveStorageKey(mediaKey(id, 'mp4'))).not.toBeNull()
        expect(resolveStorageKey(posterKey(id))).not.toBeNull()
    })

    test('a poster is a jpg beside the media', () => {
        expect(posterKey('507f1f77bcf86cd799439011')).toBe('media:507f1f77bcf86cd799439011_poster.jpg')
    })
})
