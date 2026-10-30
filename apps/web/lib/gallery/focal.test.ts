import { describe, expect, test } from 'vitest'
import { clampFocal, focalPosition } from './focal'

describe('clampFocal', () => {
    test('keeps a percentage, to one decimal', () => {
        expect(clampFocal(42)).toBe(42)
        expect(clampFocal(33.3333)).toBe(33.3)
    })

    test('pulls an out-of-range value back to the edge', () => {
        expect(clampFocal(-5)).toBe(0)
        expect(clampFocal(140)).toBe(100)
    })

    test('rejects anything that is not a finite number', () => {
        for (const v of [undefined, null, '50', NaN, Infinity, {}]) expect(clampFocal(v)).toBeNull()
    })
})

describe('focalPosition', () => {
    test('is an object-position when both coordinates are set', () => {
        expect(focalPosition({ focalX: 20, focalY: 75.5 })).toBe('20% 75.5%')
        expect(focalPosition({ focalX: 0, focalY: 0 })).toBe('0% 0%')
    })

    test('is undefined — the centre default — when either is missing', () => {
        expect(focalPosition(null)).toBeUndefined()
        expect(focalPosition({})).toBeUndefined()
        expect(focalPosition({ focalX: 20 })).toBeUndefined()
        expect(focalPosition({ focalY: 20 })).toBeUndefined()
    })
})
