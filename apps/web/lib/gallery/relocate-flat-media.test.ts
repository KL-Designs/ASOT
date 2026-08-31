import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

import { buildMediaFilename } from './filenames'

/**
 * Pins scripts/relocate-flat-media.mjs's `buildName` against this app's own
 * `buildMediaFilename`. A root-level .mjs cannot import TypeScript, so that
 * script carries its own copy of the filename grammar — the same duplication
 * naming.ts already documents for splitOperation/normalizeKey — and an
 * unpinned copy drifts silently: a drifted script writes files the server's
 * own key-resolution logic cannot find.
 *
 * Imported via a computed file:// URL (not a string literal) rather than a
 * relative specifier, so `npx tsc --noEmit` never tries to resolve module
 * types for a plain .mjs file with no declarations, and so importing this
 * module never runs the script — relocate-flat-media.mjs guards its own
 * top-level `main()` behind a check that this is the entry module, which a
 * dynamic import from a test can never satisfy. Importing it here must not
 * connect to Mongo or touch a real MONGO_URI.
 */
const SCRIPT_URL = pathToFileURL(resolve(__dirname, '../../../../scripts/relocate-flat-media.mjs')).href
const { buildName, resolveFolder } = await import(SCRIPT_URL)

const ID = '6a9380f11c4e5d2a77b31099'
const emoji = String.fromCodePoint(0x1f642)

const cases: Record<string, { id: string, ext: string, author?: string | null, caption?: string | null }> = {
    'author and caption': { id: ID, ext: 'mp4', author: 'Koda', caption: 'Chopper came in hot' },
    'caption only': { id: ID, ext: 'jpg', caption: 'Chopper came in hot' },
    'author only': { id: ID, ext: 'jpg', author: 'Koda' },
    'neither — the bare id': { id: ID, ext: 'jpg' },
    'a part that sanitises to nothing is omitted, not left dangling': { id: ID, ext: 'jpg', author: 'Koda', caption: '///' },
    'the extension is normalised': { id: ID, ext: '.JPG' },
    'a long caption needing truncation': { id: ID, ext: 'jpg', caption: 'word '.repeat(80) },
    'a caption with every illegal character at once': { id: ID, ext: 'jpg', author: 'Koda', caption: 'a/b\\c:d*e?f"g<h>i|j[k]l' },
    'whitespace collapsed around a stripped illegal character': { id: ID, ext: 'jpg', caption: 'shot [ image]' },
    'an emoji astride the truncation boundary': { id: ID, ext: 'jpg', caption: `${'a'.repeat(79)}${emoji}` },
    'trailing dots and spaces': { id: ID, ext: 'jpg', caption: 'Danger close...' },
}

describe('relocate-flat-media.mjs buildName', () => {
    test.each(Object.entries(cases))('matches buildMediaFilename byte-for-byte: %s', (_name, opts) => {
        expect(buildName(opts)).toBe(buildMediaFilename(opts))
    })
})

/**
 * The script used `doc.operation` verbatim as a folder name. A document
 * written before the folder-resolving accept path shipped carries the
 * operation's RAW TITLE, so that minted a brand new directory beside the
 * numbered one already holding that operation's photographs — a duplicate
 * folder and a split facet rail, the same class of defect as the three-matcher
 * mismatch in naming.ts. Both folder names below are real.
 */
describe('relocate-flat-media.mjs resolveFolder', () => {
    let contentDir: string

    beforeEach(() => {
        contentDir = mkdtempSync(join(tmpdir(), 'asot-flat-'))
        for (const dir of [
            join(contentDir, '2021', '9. Op Copper Ridge (Lanze Verde)'),
            join(contentDir, '2021', '12. MW Training (CAG)'),
            join(contentDir, '2021', '4. Op Silent Ridge'),
        ]) mkdirSync(dir, { recursive: true })
    })

    afterEach(() => rmSync(contentDir, { recursive: true, force: true }))

    test('reuses the existing folder for an operation carrying its raw title', () => {
        expect(resolveFolder(contentDir, '2021', 'OPERATION Silent Ridge \u2014 Sat'))
            .toBe('4. Op Silent Ridge')
    })

    test('falls back to the stripped key for the two parenthetical folders', () => {
        expect(resolveFolder(contentDir, '2021', 'OPERATION Copper Ridge \u2014 Sun'))
            .toBe('9. Op Copper Ridge (Lanze Verde)')
        expect(resolveFolder(contentDir, '2021', 'MW Training'))
            .toBe('12. MW Training (CAG)')
    })

    test('an operation with no folder yet keeps its own name', () => {
        expect(resolveFolder(contentDir, '2021', 'Op Brand New')).toBe('Op Brand New')
    })

    test('a year with no folders at all is not an error', () => {
        expect(resolveFolder(contentDir, '2030', 'Op Future')).toBe('Op Future')
    })
})
