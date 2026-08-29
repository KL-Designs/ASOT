import { describe, test, expect } from 'vitest'
import { resolveStorageKey, mediaKey, posterKey, MEDIA_DIR, CONTENT_DIR } from './paths'
import { sep } from 'path'

describe('resolveStorageKey', () => {
    test('a media key resolves inside the media directory', () => {
        const resolved = resolveStorageKey('media:507f1f77bcf86cd799439011.jpg')
        expect(resolved?.startsWith(MEDIA_DIR + sep)).toBe(true)
        expect(resolved?.endsWith('507f1f77bcf86cd799439011.jpg')).toBe(true)
    })

    test('a legacy key resolves inside the content directory', () => {
        const resolved = resolveStorageKey('legacy:2025/1. Op Black Hill/I/a.png')
        expect(resolved?.startsWith(CONTENT_DIR + sep)).toBe(true)
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
    test('round-trip through resolveStorageKey', () => {
        const id = '507f1f77bcf86cd799439011'
        expect(resolveStorageKey(mediaKey(id, 'mp4'))).not.toBeNull()
        expect(resolveStorageKey(posterKey(id))).not.toBeNull()
    })

    test('a poster is a jpg beside the media', () => {
        expect(posterKey('507f1f77bcf86cd799439011')).toBe('media:507f1f77bcf86cd799439011_poster.jpg')
    })
})
