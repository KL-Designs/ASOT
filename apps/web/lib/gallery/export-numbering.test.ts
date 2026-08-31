import { describe, test, expect } from 'vitest'

import {
    buildFolderNumbering,
    foldersFromAggregate,
    numberContentEntry,
    type ExportFolderRow,
} from './export-numbering'

/**
 * The numbers only exist inside a downloaded backup now, and the thing that
 * has to survive them is the ROUND TRIP: a numbered folder re-imported from an
 * export must reconcile back to the same documents rather than reading as a
 * new set of operations.
 *
 * Every rule below is a rule about that, not about presentation:
 *   - already-numbered folders come out byte-identical, because the whole
 *     legacy archive is numbered and its documents are matched by PATH;
 *   - a folder is only renamed when every document in it can be found again by
 *     the id in its filename, which is what survives a rename;
 *   - a rename never collides with another folder, because two operations
 *     landing in one folder is the split this subsystem exists to prevent.
 */

const row = (partial: Partial<ExportFolderRow> & { year: string, folder: string }): ExportFolderRow => ({
    earliest: null,
    idNamed: true,
    ...partial,
})

const date = (iso: string) => new Date(iso)

describe('buildFolderNumbering', () => {
    test('numbers a year\'s unnumbered folders by date, starting at 1', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Copper Ridge', earliest: date('2026-06-13T09:00:00Z') }),
            row({ year: '2026', folder: 'Op Black Hills', earliest: date('2026-02-07T09:00:00Z') }),
            row({ year: '2026', folder: 'Op Lone Wolf', earliest: date('2026-04-11T09:00:00Z') }),
        ])

        // Date order, not the alphabetical order the input happens to be in
        // and not the insertion order `highest + 1` used to produce.
        expect(numbering.get('2026/Op Black Hills')).toBe('1. Op Black Hills')
        expect(numbering.get('2026/Op Lone Wolf')).toBe('2. Op Lone Wolf')
        expect(numbering.get('2026/Op Copper Ridge')).toBe('3. Op Copper Ridge')
    })

    /* The one that would break the round trip most quietly. Every folder in
       the legacy archive is numbered AND its documents are keyed
       `legacy:{year}/{op}/{mission}/{file}` — matched by path, because those
       filenames predate media ids. Renaming one takes every document in it
       past reconcile's rule 2 and out as a missing file, in front of a human
       holding a delete button. */
    test('leaves an already-numbered folder exactly as it is', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2021', folder: '15. Op Black Hills', earliest: date('2021-02-07T09:00:00Z'), idNamed: false }),
            row({ year: '2021', folder: '9. Op Copper Ridge (Lanze Verde)', earliest: date('2021-06-13T09:00:00Z') }),
        ])

        // Not renamed, and above all not '1. 15. Op Black Hills'.
        expect(numbering.has('2021/15. Op Black Hills')).toBe(false)
        expect(numbering.has('2021/9. Op Copper Ridge (Lanze Verde)')).toBe(false)
        expect(numbering.size).toBe(0)
    })

    /* An unnumbered folder can still hold a path-matched document — a legacy
       file a reviewer dragged into a new operation's folder, say. Renaming it
       loses that document's bytes on re-import, so the folder keeps its name
       and only loses the readability aid. */
    test('does not rename a folder that holds a document only findable by its path', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Mixed', earliest: date('2026-02-07T09:00:00Z'), idNamed: false }),
            row({ year: '2026', folder: 'Op Clean', earliest: date('2026-03-07T09:00:00Z') }),
        ])

        expect(numbering.has('2026/Op Mixed')).toBe(false)
        // Ranking still counts the skipped folder, so the numbers a reader
        // sees follow the year's real chronology rather than closing up over a
        // folder that is sitting right there beside them.
        expect(numbering.get('2026/Op Clean')).toBe('2. Op Clean')
    })

    /* The same rule the gallery applies everywhere else: an undated operation
       is missing information, not the beginning of time. */
    test('an undated folder ranks last, not first', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Undated' }),
            row({ year: '2026', folder: 'Op Dated', earliest: date('2026-05-16T09:00:00Z') }),
        ])

        expect(numbering.get('2026/Op Dated')).toBe('1. Op Dated')
        expect(numbering.get('2026/Op Undated')).toBe('2. Op Undated')
    })

    /* Two folders that extract to one name would put two operations'
       photographs in the same folder, and reconcile would then rewrite one
       set of documents to the other's facets — the split facet rail, reached
       through the backup instead of through a submission. */
    test('skips a rename that would collide with a folder already in that year', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Twin', earliest: date('2026-02-07T09:00:00Z') }),
            row({ year: '2026', folder: '1. Op Twin', earliest: date('2026-03-07T09:00:00Z'), idNamed: false }),
        ])

        // 'Op Twin' ranks first and would become '1. Op Twin', which is
        // already a different folder in the same year.
        expect(numbering.has('2026/Op Twin')).toBe(false)
    })

    test('each year is numbered independently', () => {
        const numbering = buildFolderNumbering([
            row({ year: '2025', folder: 'Op Alpha', earliest: date('2025-05-16T09:00:00Z') }),
            row({ year: '2026', folder: 'Op Bravo', earliest: date('2026-05-16T09:00:00Z') }),
        ])

        expect(numbering.get('2025/Op Alpha')).toBe('1. Op Alpha')
        expect(numbering.get('2026/Op Bravo')).toBe('1. Op Bravo')
    })

    // Two operations of one weekend share a date exactly, so the tiebreak has
    // to be deterministic or two exports of one archive disagree.
    test('folders sharing a date are ordered by name, not by input order', () => {
        const first = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Zulu', earliest: date('2026-05-16T09:00:00Z') }),
            row({ year: '2026', folder: 'Op Alpha', earliest: date('2026-05-16T09:00:00Z') }),
        ])
        const second = buildFolderNumbering([
            row({ year: '2026', folder: 'Op Alpha', earliest: date('2026-05-16T09:00:00Z') }),
            row({ year: '2026', folder: 'Op Zulu', earliest: date('2026-05-16T09:00:00Z') }),
        ])

        expect(first.get('2026/Op Alpha')).toBe('1. Op Alpha')
        expect([...first.entries()]).toEqual([...second.entries()])
    })
})

describe('numberContentEntry', () => {
    const numbering = new Map([['2026/Op Black Hills', '1. Op Black Hills']])

    test('rewrites the operation folder in a file path', () => {
        expect(numberContentEntry('content/2026/Op Black Hills/Saturday/Koda [a].jpg', false, numbering))
            .toBe('content/2026/1. Op Black Hills/Saturday/Koda [a].jpg')
    })

    test('rewrites the folder\'s own directory entry, with or without a trailing slash', () => {
        expect(numberContentEntry('content/2026/Op Black Hills', true, numbering))
            .toBe('content/2026/1. Op Black Hills')
        expect(numberContentEntry('content/2026/Op Black Hills/', true, numbering))
            .toBe('content/2026/1. Op Black Hills/')
    })

    /* A file loose directly inside a year folder sits at the same depth as an
       operation directory, and the path alone cannot tell them apart — which
       is why isDirectory is a parameter rather than a guess. Renaming it would
       invent a folder name out of a filename. */
    test('does not treat a file directly inside a year folder as a folder', () => {
        expect(numberContentEntry('content/2026/Op Black Hills', false, numbering))
            .toBe('content/2026/Op Black Hills')
    })

    test('leaves the other gallery trees alone', () => {
        for (const name of ['media/abc.jpg', 'staging/abc.jpg', 'featured/q.jpg', 'sotm/r.jpg']) {
            expect(numberContentEntry(name, false, numbering)).toBe(name)
        }
    })

    test('leaves a folder the numbering has never heard of exactly as it is', () => {
        // The normal case for a folder that is already numbered, and for an
        // old snapshot whose tree no longer matches today's database.
        expect(numberContentEntry('content/2021/15. Op Black Hills/I/a.png', false, numbering))
            .toBe('content/2021/15. Op Black Hills/I/a.png')
        expect(numberContentEntry('content/Unknown/a.png', false, numbering))
            .toBe('content/Unknown/a.png')
    })
})

describe('foldersFromAggregate', () => {
    test('reads the shape the pipeline produces', () => {
        const rows = foldersFromAggregate([
            { _id: { year: '2026', folder: 'Op Black Hills' }, earliest: new Date('2026-02-07T09:00:00Z'), idNamed: true },
        ])

        expect(rows).toEqual([
            { year: '2026', folder: 'Op Black Hills', earliest: new Date('2026-02-07T09:00:00Z'), idNamed: true },
        ])
    })

    /* Anything but an explicit `true` has to read as "do not rename". A $min
       that returned null (an empty group, an older server) or a field that is
       simply absent must never be taken as permission to rename a folder full
       of path-matched documents. */
    test('treats a missing or non-boolean idNamed as unsafe to rename', () => {
        const rows = foldersFromAggregate([
            { _id: { year: '2026', folder: 'A' } },
            { _id: { year: '2026', folder: 'B' }, idNamed: null },
            { _id: { year: '2026', folder: 'C' }, idNamed: 1 },
        ])

        expect(rows.map(r => r.idNamed)).toEqual([false, false, false])
    })

    test('drops a row with no usable year or folder rather than inventing one', () => {
        // `$group` omits a field the document does not have, so `_id.folder`
        // really can be absent — an item with no operation is one of the
        // 1,157 the console's "Not linked to an operation" view counts.
        expect(foldersFromAggregate([
            { _id: { year: '2026' } },
            { _id: { folder: 'Op Orphan' } },
            { _id: null },
            null,
            'not a row',
        ])).toEqual([])
    })

    test('a non-Date earliest becomes null, which ranks last', () => {
        const rows = foldersFromAggregate([
            { _id: { year: '2026', folder: 'Op X' }, earliest: '2026-02-07', idNamed: true },
        ])

        expect(rows[0].earliest).toBeNull()
    })
})
