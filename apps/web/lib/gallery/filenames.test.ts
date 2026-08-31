import { describe, test, expect } from 'vitest'

import { MAX_NAME_PART, buildMediaFilename, parseMediaFilename, sanitizeFilePart } from './filenames'

const ID = '6a9380f11c4e5d2a77b31099'

describe('sanitizeFilePart', () => {
    test('strips the characters no filesystem accepts', () => {
        expect(sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    })

    // A caption containing brackets could otherwise forge an id suffix.
    test('strips square brackets', () => {
        expect(sanitizeFilePart('shot [6a9380f11c4e5d2a77b31099]')).toBe('shot 6a9380f11c4e5d2a77b31099')
    })

    test('strips control characters', () => {
        expect(sanitizeFilePart('a\u0000b\u001fc')).toBe('abc')
    })

    test('collapses whitespace and trims', () => {
        expect(sanitizeFilePart('  too   many\t\tspaces  ')).toBe('too many spaces')
    })

    // Stripping a bracket or a control character can leave two spaces
    // touching where it used to sit — a second collapse pass has to catch
    // what the first pass, run before ILLEGAL, could not have seen coming.
    test('collapses a double space left behind by stripping an illegal character', () => {
        expect(sanitizeFilePart('shot [ image]')).toBe('shot image')
        expect(sanitizeFilePart('Contact [ north ridge ]')).toBe('Contact north ridge')
    })

    test('collapses a double space left behind by stripping a control character', () => {
        const bell = String.fromCharCode(7)
        expect(sanitizeFilePart(`a ${bell} b`)).toBe('a b')
    })

    // Windows silently drops these, which would make the name on disk differ
    // from the name recorded in the database.
    test('strips trailing dots and spaces', () => {
        expect(sanitizeFilePart('Danger close...')).toBe('Danger close')
        expect(sanitizeFilePart('Danger close   ')).toBe('Danger close')
    })

    test('an entirely-punctuation part collapses to empty', () => {
        expect(sanitizeFilePart('///')).toBe('')
        expect(sanitizeFilePart('...')).toBe('')
    })

    test('null and undefined are empty', () => {
        expect(sanitizeFilePart(null)).toBe('')
        expect(sanitizeFilePart(undefined)).toBe('')
        expect(sanitizeFilePart('')).toBe('')
    })
})

describe('buildMediaFilename', () => {
    test('author and caption', () => {
        expect(buildMediaFilename({ id: ID, ext: 'mp4', author: 'Koda', caption: 'Chopper came in hot' }))
            .toBe(`Koda \u2014 Chopper came in hot [${ID}].mp4`)
    })

    test('caption only', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', caption: 'Chopper came in hot' }))
            .toBe(`Chopper came in hot [${ID}].jpg`)
    })

    test('author only', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', author: 'Koda' }))
            .toBe(`Koda [${ID}].jpg`)
    })

    test('neither is the bare id', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg' })).toBe(`${ID}.jpg`)
    })

    test('a part that sanitises to nothing is omitted, not left as a dangling separator', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', author: 'Koda', caption: '///' }))
            .toBe(`Koda [${ID}].jpg`)
    })

    test('the extension is normalised', () => {
        expect(buildMediaFilename({ id: ID, ext: '.JPG' })).toBe(`${ID}.jpg`)
    })

    test('a long caption is truncated to the cap', () => {
        const name = buildMediaFilename({ id: ID, ext: 'jpg', caption: 'word '.repeat(80) })
        const stem = name.slice(0, name.indexOf(' ['))
        expect(stem.length).toBeLessThanOrEqual(MAX_NAME_PART)
        expect(stem.endsWith(' ')).toBe(false)
    })

    test('truncation does not leave a trailing dot', () => {
        const name = buildMediaFilename({ id: ID, ext: 'jpg', caption: `${'a'.repeat(78)}. tail` })
        expect(name).not.toContain('. [')
    })

    // An astral character (built via fromCodePoint, not a \u escape, so the
    // source stays plain ASCII) is two UTF-16 code units. Landing the cut
    // exactly between them must not leave a lone surrogate in the filename —
    // TextEncoder replaces an unpaired surrogate with U+FFFD when it hits
    // one, so a round trip through it changes the string if one snuck in.
    test('does not split a surrogate pair at the truncation boundary', () => {
        const emoji = String.fromCodePoint(0x1f642)
        const name = buildMediaFilename({ id: ID, ext: 'jpg', caption: `${'a'.repeat(79)}${emoji}` })
        expect(new TextDecoder().decode(new TextEncoder().encode(name))).toBe(name)
    })
})

describe('parseMediaFilename', () => {
    test('reads the id back out of everything build can produce', () => {
        for (const opts of [
            { id: ID, ext: 'mp4', author: 'Koda', caption: 'Chopper came in hot' },
            { id: ID, ext: 'jpg', caption: 'Chopper came in hot' },
            { id: ID, ext: 'jpg', author: 'Koda' },
            { id: ID, ext: 'jpg' },
        ]) {
            expect(parseMediaFilename(buildMediaFilename(opts)).id).toBe(ID)
        }
    })

    test('a legacy filename has no id but still reports its extension', () => {
        expect(parseMediaFilename('arma3_2021-08-14_01.png')).toEqual({ id: null, ext: 'png' })
        expect(parseMediaFilename('DSC_0411.JPG')).toEqual({ id: null, ext: 'jpg' })
    })

    // The id is read from the END, so bracket-shaped text earlier in a caption
    // cannot be mistaken for one.
    test('only the trailing bracket counts', () => {
        const name = `[aaaaaaaaaaaaaaaaaaaaaaaa] not the id [${ID}].jpg`
        expect(parseMediaFilename(name).id).toBe(ID)
    })

    test('rejects a bracket that is not a 24-character lowercase hex id', () => {
        expect(parseMediaFilename('x [not-an-objectid].jpg').id).toBeNull()
        expect(parseMediaFilename('x [6A9380F11C4E5D2A77B31099].jpg').id).toBeNull()
        expect(parseMediaFilename(`x [${ID}a].jpg`).id).toBeNull()
        expect(parseMediaFilename(`x [${ID}]`).id).toBeNull()
    })

    test('a file with no extension', () => {
        expect(parseMediaFilename('README')).toEqual({ id: null, ext: '' })
    })
})
