import { describe, test, expect } from 'vitest'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { PERMISSION_DESCRIPTIONS } from '@/lib/permissions-descriptions'

const GALLERY_KEYS = ['gallery.submit', 'gallery.review', 'gallery.tags'] as const

describe('the gallery submission permission keys', () => {
    test('each one exists in the flattened catalog', () => {
        // A typo here is a gate that never opens for anybody, silently.
        for (const key of GALLERY_KEYS) expect(PERMISSION_KEYS).toContain(key)
    })

    test('the key that already existed is untouched', () => {
        expect(PERMISSION_KEYS).toContain('gallery.manage')
    })

    test('each one is described, so the Permissions Explorer can explain it', () => {
        for (const key of GALLERY_KEYS) expect(PERMISSION_DESCRIPTIONS[key], key).toBeTruthy()
    })
})
