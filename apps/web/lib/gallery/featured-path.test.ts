import { describe, test, expect } from 'vitest'
import path from 'path'

import { FEATURED_DIR, resolveFeaturedImage } from './featured-path'

describe('resolveFeaturedImage', () => {
    test('accepts a plain image filename', () => {
        const out = resolveFeaturedImage('shot-01.jpg')
        expect(out).toBe(path.join(FEATURED_DIR, 'shot-01.jpg'))
    })

    test('accepts the extensions the archive actually contains', () => {
        for (const name of ['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.gif', 'a.JPG']) {
            expect(resolveFeaturedImage(name)).not.toBeNull()
        }
    })

    // The whole reason this module exists. `../../../.env` reached the
    // repository root and served MONGO_URI and DISCORD_TOKEN to anyone.
    test('refuses traversal', () => {
        for (const attack of [
            '../../../.env',
            '../../../../.env',
            '..%2f..%2f.env',
            '../content/2021/x.png',
            '..\\..\\.env',
            '/etc/passwd',
            'C:\\Windows\\win.ini',
            'sub/dir/file.jpg',
            './x.jpg',
        ]) {
            expect(resolveFeaturedImage(attack), attack).toBeNull()
        }
    })

    test('refuses names that are not images', () => {
        expect(resolveFeaturedImage('notes.txt')).toBeNull()
        expect(resolveFeaturedImage('script.mjs')).toBeNull()
        expect(resolveFeaturedImage('archive.zip')).toBeNull()
    })

    test('refuses empty, null and control characters', () => {
        expect(resolveFeaturedImage(null)).toBeNull()
        expect(resolveFeaturedImage('')).toBeNull()
        expect(resolveFeaturedImage('a\u0000.jpg')).toBeNull()
        expect(resolveFeaturedImage('.')).toBeNull()
        expect(resolveFeaturedImage('..')).toBeNull()
    })
})
