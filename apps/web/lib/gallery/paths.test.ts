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

    test('refuses traversal, empty segments and too many segments', () => {
        for (const bad of [
            'content:../../.env',
            'content:2021/../../../.env',
            'content:2021/./x.png',
            'content:2021//x.png',
            'content:2021\\4. Op\\x.png',
            'content:x.png',
            'content:a/b/c/d/e.png',
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
})
