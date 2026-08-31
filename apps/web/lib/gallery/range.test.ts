import { describe, test, expect } from 'vitest'
import { parseRange } from './range'

describe('parseRange', () => {
    test('no header serves the whole file', () => {
        expect(parseRange(null, 1000)).toEqual({ kind: 'full' })
    })

    test('an open range from the start is satisfiable', () => {
        expect(parseRange('bytes=0-', 1000)).toEqual({ kind: 'range', start: 0, end: 999 })
    })

    test('a bounded range in the middle', () => {
        expect(parseRange('bytes=100-199', 1000)).toEqual({ kind: 'range', start: 100, end: 199 })
    })

    test('an open-ended range from an arbitrary offset', () => {
        expect(parseRange('bytes=100-', 1000)).toEqual({ kind: 'range', start: 100, end: 999 })
    })

    test('the suffix form means the LAST N bytes, not the first', () => {
        expect(parseRange('bytes=-500', 1000)).toEqual({ kind: 'range', start: 500, end: 999 })
    })

    test('a suffix longer than the file clamps to the whole file', () => {
        expect(parseRange('bytes=-500', 200)).toEqual({ kind: 'range', start: 0, end: 199 })
    })

    test('a zero-length suffix is unsatisfiable', () => {
        expect(parseRange('bytes=-0', 1000)).toEqual({ kind: 'unsatisfiable' })
    })

    test('an end beyond the file size clamps rather than failing', () => {
        expect(parseRange('bytes=100-2000', 1000)).toEqual({ kind: 'range', start: 100, end: 999 })
    })

    test('a start at or past the file size is unsatisfiable', () => {
        expect(parseRange('bytes=1000-1005', 1000)).toEqual({ kind: 'unsatisfiable' })
    })

    test('start exactly one past the last valid byte is unsatisfiable', () => {
        expect(parseRange('bytes=999-', 1000)).not.toEqual({ kind: 'unsatisfiable' })
        expect(parseRange('bytes=1000-', 1000)).toEqual({ kind: 'unsatisfiable' })
    })

    test('start after end is unsatisfiable', () => {
        expect(parseRange('bytes=500-100', 1000)).toEqual({ kind: 'unsatisfiable' })
    })

    test('a single-byte range at the very first byte', () => {
        expect(parseRange('bytes=0-0', 1000)).toEqual({ kind: 'range', start: 0, end: 0 })
    })

    test('a single-byte range at the very last byte', () => {
        expect(parseRange('bytes=999-999', 1000)).toEqual({ kind: 'range', start: 999, end: 999 })
    })

    test('a range spanning the entire file is still a 206, not a full response', () => {
        expect(parseRange('bytes=0-999', 1000)).toEqual({ kind: 'range', start: 0, end: 999 })
    })

    test('a malformed header is treated as no header, not an error', () => {
        expect(parseRange('bytes=abc', 1000)).toEqual({ kind: 'full' })
        expect(parseRange('nonsense', 1000)).toEqual({ kind: 'full' })
        expect(parseRange('bytes=', 1000)).toEqual({ kind: 'full' })
        expect(parseRange('bytes=-', 1000)).toEqual({ kind: 'full' })
    })

    test('an unrecognised unit is treated as no header', () => {
        expect(parseRange('items=0-10', 1000)).toEqual({ kind: 'full' })
    })

    test('a multi-range header is not supported, so it serves the whole file', () => {
        expect(parseRange('bytes=0-99,200-299', 1000)).toEqual({ kind: 'full' })
    })

    test('a zero-byte file has no satisfiable range', () => {
        expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' })
        expect(parseRange('bytes=-500', 0)).toEqual({ kind: 'unsatisfiable' })
        expect(parseRange('bytes=0-0', 0)).toEqual({ kind: 'unsatisfiable' })
    })

    test('a zero-byte file with no header still serves the (empty) whole file', () => {
        expect(parseRange(null, 0)).toEqual({ kind: 'full' })
    })
})
