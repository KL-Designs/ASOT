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
            year: '2021', campaign: null, operation: '4. Op Silent Ridge', mission: 'I', file: 'arma3_01.png',
        })
    })

    test('three segments — a published submission with no mission', () => {
        expect(parseContentPath('2026/23. Op New Winter/Koda [6a93].mp4')).toEqual({
            year: '2026', campaign: null, operation: '23. Op New Winter', mission: null, file: 'Koda [6a93].mp4',
        })
    })

    test('two segments under Unknown', () => {
        expect(parseContentPath('Unknown/Reaper.jpg')).toEqual({
            year: null, campaign: null, operation: null, mission: null, file: 'Reaper.jpg',
        })
    })

    // Unknown/ means "no year" at any depth, not "the year is called
    // Unknown" — a human reorganising a backup can nest a folder under it.
    test('a folder nested under Unknown is the operation, not the year', () => {
        expect(parseContentPath('Unknown/SomeFolder/x.jpg')).toEqual({
            year: null, campaign: null, operation: 'SomeFolder', mission: null, file: 'x.jpg',
        })
    })

    test('two folders nested under Unknown is operation and mission, still no year', () => {
        expect(parseContentPath('Unknown/SomeFolder/Mission/x.jpg')).toEqual({
            year: null, campaign: null, operation: 'SomeFolder', mission: 'Mission', file: 'x.jpg',
        })
    })

    // A year folder holding files directly is not a shape this writes, but a
    // human reorganising a backup can produce one. Report the year rather
    // than dropping the file.
    test('two segments under a year', () => {
        expect(parseContentPath('2021/loose.jpg')).toEqual({
            year: '2021', campaign: null, operation: null, mission: null, file: 'loose.jpg',
        })
    })

    test('five segments — a campaign mission with a day folder', () => {
        expect(parseContentPath('2026/1. Op Trinity/Operation Trinity I/Saturday/Koda [6a93].jpg')).toEqual({
            year: '2026',
            campaign: '1. Op Trinity',
            operation: 'Operation Trinity I',
            mission: 'Saturday',
            file: 'Koda [6a93].jpg',
        })
    })

    /* The ambiguity parseContentPath resolves in favour of the legacy tree. A
       campaign mission whose operation has no day slot writes exactly this
       shape, and so does every one of the archive's thousands of legacy files;
       nothing in the path tells them apart, so the reading that is correct for
       the archive wins and no campaign is invented for a folder that is far
       more likely to be an operation. Pinned so the choice cannot be reversed
       by accident — reading dirs[1] as a campaign here would relabel the whole
       legacy tree on the next reconcile. */
    test('three folders stay operation and mission — a campaign is never read out of an ambiguous depth', () => {
        expect(parseContentPath('2026/1. Op Trinity/Operation Trinity I/Koda [6a93].jpg')).toEqual({
            year: '2026',
            campaign: null,
            operation: '1. Op Trinity',
            mission: 'Operation Trinity I',
            file: 'Koda [6a93].jpg',
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
            // Six segments: one level deeper than the campaign grammar can
            // produce, so it is malformed rather than lenient.
            '2021/a/b/c/d/x.jpg',
            '2021/1. Op Trinity/Mission I/Saturday/../../../.env',
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
            { year: '2021', campaign: null, operation: '4. Op Silent Ridge', mission: 'I', file: 'x.png' },
            { year: '2026', campaign: null, operation: '23. Op New Winter', mission: null, file: 'y.mp4' },
            { year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity I', mission: 'Saturday', file: 'z.jpg' },
            { year: '2026', campaign: null, operation: '5. Op Lone Wolf', mission: 'Sunday', file: 'w.jpg' },
        ]) {
            expect(parseContentPath(buildContentPath(f))).toEqual(f)
        }
    })

    /* A campaign with no operation beside it is the one shape that would break
       the round-trip above: `{year}/{campaign}/{file}` reads straight back as
       an OPERATION named after the campaign. The Unknown guard is what makes
       it unreachable, and this pins that rather than the guard's wording. */
    test('a campaign with no operation is Unknown, never a two-folder path', () => {
        expect(buildContentPath({ year: '2026', campaign: '1. Op Trinity', operation: null, file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })

    test('no operation means Unknown, and the year is dropped with it', () => {
        expect(buildContentPath({ year: '2026', campaign: null, operation: null, file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
        expect(buildContentPath({ file: 'y.jpg' })).toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })

    test('no year means Unknown even when an operation is named', () => {
        expect(buildContentPath({ operation: '23. Op New Winter', file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })
})
