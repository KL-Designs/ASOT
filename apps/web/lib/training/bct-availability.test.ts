import { describe, expect, test, vi } from 'vitest'

// The module under test imports the database for its other export; this test
// only exercises the pure rule.
vi.mock('@/lib/mongo', () => ({ default: {} }))

import { hasCompletedBct } from './bct-availability'

describe('hasCompletedBct', () => {
    test('needs both courses', () => {
        expect(hasCompletedBct([])).toBe(false)
        expect(hasCompletedBct(['BCT 1'])).toBe(false)
        expect(hasCompletedBct(['BCT 2'])).toBe(false)
        expect(hasCompletedBct(['BCT 1', 'BCT 2'])).toBe(true)
    })

    test('is not thrown by other qualifications, case or spacing', () => {
        expect(hasCompletedBct(['Basic Medical Course', ' bct 2 ', 'Bct 1'])).toBe(true)
    })

    test('does not mistake a longer label for a BCT course', () => {
        expect(hasCompletedBct(['BCT 1', 'BCT 20'])).toBe(false)
    })
})
