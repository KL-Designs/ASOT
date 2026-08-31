import { describe, test, expect } from 'vitest'
import { canTransition, isPublic, GALLERY_STATUSES, type GalleryStatus } from './status'

const ALLOWED: [GalleryStatus, GalleryStatus][] = [
    ['processing', 'pending'],
    ['pending', 'live'],
    ['pending', 'rejected'],
    ['live', 'hidden'],
    ['hidden', 'live'],
]

describe('canTransition', () => {
    test('every allowed move is allowed', () => {
        for (const [from, to] of ALLOWED) expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
    })

    test('every move not on the list is refused', () => {
        const allowed = new Set(ALLOWED.map(([f, t]) => `${f}->${t}`))
        for (const from of GALLERY_STATUSES) {
            for (const to of GALLERY_STATUSES) {
                if (from === to) continue
                if (allowed.has(`${from}->${to}`)) continue
                expect(canTransition(from, to), `${from} -> ${to} should be refused`).toBe(false)
            }
        }
    })

    test('rejected is terminal — its bytes are already deleted', () => {
        for (const to of GALLERY_STATUSES) {
            if (to === 'rejected') continue
            expect(canTransition('rejected', to), `rejected -> ${to}`).toBe(false)
        }
    })

    test('a published item cannot re-enter the review queue', () => {
        expect(canTransition('live', 'pending')).toBe(false)
        expect(canTransition('live', 'processing')).toBe(false)
    })

    test('a no-op transition is not an error', () => {
        for (const s of GALLERY_STATUSES) expect(canTransition(s, s)).toBe(true)
    })
})

describe('isPublic', () => {
    test('only live media is public', () => {
        expect(isPublic('live')).toBe(true)
        for (const s of GALLERY_STATUSES) {
            if (s === 'live') continue
            expect(isPublic(s), s).toBe(false)
        }
    })
})
