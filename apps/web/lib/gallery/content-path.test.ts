import { describe, test, expect } from 'vitest'

import { MAX_SEGMENT, UNKNOWN_FOLDER, buildContentPath, parseContentPath, sanitizeSegment } from './content-path'

describe('sanitizeSegment', () => {
    test('strips separators and reserved characters', () => {
        expect(sanitizeSegment('23. Op New/Winter')).toBe('23. Op NewWinter')
        expect(sanitizeSegment('a:b*c?d"e<f>g|h')).toBe('abcdefgh')
    })

    test('strips trailing dots and spaces', () => {
        expect(sanitizeSegment('Operation Montage IV.')).toBe('Operation Montage IV')
    })

    test('caps length and does not leave a trailing dot after the cap', () => {
        const out = sanitizeSegment(`${'a'.repeat(MAX_SEGMENT)}. tail`)
        expect(out.length).toBeLessThanOrEqual(MAX_SEGMENT)
        expect(out.endsWith('.')).toBe(false)
    })

    test('keeps the punctuation real operation folders use', () => {
        expect(sanitizeSegment('18. Op Copper Ridge (Lanze Verde)')).toBe('18. Op Copper Ridge (Lanze Verde)')
        expect(sanitizeSegment('2022 - 2023')).toBe('2022 - 2023')
    })
})

describe('parseContentPath', () => {
    test('four segments — a legacy file with a mission', () => {
        expect(parseContentPath('2021/4. Op Silent Ridge/I/arma3_01.png')).toEqual({
            year: '2021', operation: '4. Op Silent Ridge', mission: 'I', file: 'arma3_01.png',
        })
    })

    test('three segments — a published submission with no mission', () => {
        expect(parseContentPath('2026/23. Op New Winter/Koda [6a93].mp4')).toEqual({
            year: '2026', operation: '23. Op New Winter', mission: null, file: 'Koda [6a93].mp4',
        })
    })

    test('two segments under Unknown', () => {
        expect(parseContentPath('Unknown/Reaper.jpg')).toEqual({
            year: null, operation: null, mission: null, file: 'Reaper.jpg',
        })
    })

    // Unknown/ means "no year" at any depth, not "the year is called
    // Unknown" — a human reorganising a backup can nest a folder under it.
    test('a folder nested under Unknown is the operation, not the year', () => {
        expect(parseContentPath('Unknown/SomeFolder/x.jpg')).toEqual({
            year: null, operation: 'SomeFolder', mission: null, file: 'x.jpg',
        })
    })

    test('two folders nested under Unknown is operation and mission, still no year', () => {
        expect(parseContentPath('Unknown/SomeFolder/Mission/x.jpg')).toEqual({
            year: null, operation: 'SomeFolder', mission: 'Mission', file: 'x.jpg',
        })
    })

    // A year folder holding files directly is not a shape this writes, but a
    // human reorganising a backup can produce one. Report the year rather
    // than dropping the file.
    test('two segments under a year', () => {
        expect(parseContentPath('2021/loose.jpg')).toEqual({
            year: '2021', operation: null, mission: null, file: 'loose.jpg',
        })
    })

    test('a year folder that is a range is kept verbatim', () => {
        expect(parseContentPath('2022 - 2023/8. Op Atlantic Shield/II/x.jpg')?.year).toBe('2022 - 2023')
    })

    test('refuses traversal and malformed input', () => {
        for (const bad of [
            '../secrets.env',
            '2021/../../.env',
            '2021/./x.jpg',
            '2021\\4. Op\\x.jpg',
            'x.jpg',
            '',
            '/',
            '2021/a/b/c/d/x.jpg',
        ]) {
            expect(parseContentPath(bad), bad).toBeNull()
        }
    })

    test('leading and repeated slashes do not change the shape', () => {
        expect(parseContentPath('/2021//4. Op Silent Ridge/I/x.png')?.mission).toBe('I')
    })
})

describe('buildContentPath', () => {
    test('round-trips each shape', () => {
        for (const f of [
            { year: '2021', operation: '4. Op Silent Ridge', mission: 'I', file: 'x.png' },
            { year: '2026', operation: '23. Op New Winter', mission: null, file: 'y.mp4' },
        ]) {
            expect(parseContentPath(buildContentPath(f))).toEqual(f)
        }
    })

    test('no operation means Unknown, and the year is dropped with it', () => {
        expect(buildContentPath({ year: '2026', operation: null, file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
        expect(buildContentPath({ file: 'y.jpg' })).toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })

    test('no year means Unknown even when an operation is named', () => {
        expect(buildContentPath({ operation: '23. Op New Winter', file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })
})
