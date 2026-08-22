import { describe, test, expect } from 'vitest'
import { hexToRgb, rgbTriplet } from './colour'

describe('hexToRgb', () => {
    test('parses a six-digit hex with or without the hash', () => {
        expect(hexToRgb('#db001d')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('db001d')).toEqual({ r: 219, g: 0, b: 29 })
    })

    test('falls back to ASOT red on anything malformed', () => {
        expect(hexToRgb('')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('#fff')).toEqual({ r: 219, g: 0, b: 29 })
    })
})

describe('rgbTriplet', () => {
    test('formats for CSS custom properties', () => {
        expect(rgbTriplet('#4dd0e1')).toBe('77,208,225')
    })
})
