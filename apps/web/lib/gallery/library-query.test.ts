import { describe, test, expect } from 'vitest'

import {
    PAGE_SIZE, buildLibraryFilter, buildLibrarySort, parseLibraryParams,
} from './library-query'

const params = (qs: string) => parseLibraryParams(new URLSearchParams(qs))

describe('parseLibraryParams', () => {
    test('defaults', () => {
        expect(params('')).toEqual({
            view: 'all', year: null, operation: null, mission: null, tag: null,
            author: null, kind: null, q: null, sort: 'newest', page: 0,
            yearUnset: false, operationUnset: false,
        })
    })

    test('reads every parameter', () => {
        const p = params('view=unknown&year=2021&operation=4.+Op+Silent+Ridge&mission=I&tag=funny&author=Koda&kind=video&q=chopper&sort=rated&page=3&yearUnset=true&operationUnset=true')
        expect(p.view).toBe('unknown')
        expect(p.year).toBe('2021')
        expect(p.operation).toBe('4. Op Silent Ridge')
        expect(p.mission).toBe('I')
        expect(p.tag).toBe('funny')
        expect(p.author).toBe('Koda')
        expect(p.kind).toBe('video')
        expect(p.q).toBe('chopper')
        expect(p.sort).toBe('rated')
        expect(p.page).toBe(3)
        expect(p.yearUnset).toBe(true)
        expect(p.operationUnset).toBe(true)
    })

    test('yearUnset/operationUnset default to false, and only the literal string "true" sets them', () => {
        expect(params('').yearUnset).toBe(false)
        expect(params('yearUnset=false').yearUnset).toBe(false)
        expect(params('yearUnset=1').yearUnset).toBe(false)
        expect(params('yearUnset=true').yearUnset).toBe(true)
    })

    // An unknown value is a typo or a stale bookmark, not a reason to 500.
    test('falls back rather than trusting unknown values', () => {
        expect(params('view=nonsense').view).toBe('all')
        expect(params('sort=nonsense').sort).toBe('newest')
        expect(params('kind=nonsense').kind).toBeNull()
        expect(params('page=-4').page).toBe(0)
        expect(params('page=notanumber').page).toBe(0)
    })

    test('an empty string is the same as absent', () => {
        expect(params('year=&tag=&q=').year).toBeNull()
        expect(params('q=   ').q).toBeNull()
    })
})

describe('buildLibraryFilter', () => {
    test('every view is scoped to live media', () => {
        for (const view of ['all', 'unknown', 'nocaption', 'videos'] as const) {
            expect(buildLibraryFilter({ ...params(''), view }).status).toBe('live')
        }
    })

    // The rail's Unknown view is the migration cleanup queue. An item is
    // unknown when it has no operation link, however it got that way.
    test('unknown selects items with no operationId', () => {
        expect(buildLibraryFilter(params('view=unknown'))).toMatchObject({
            status: 'live',
            operationId: { $exists: false },
        })
    })

    test('nocaption selects absent and empty captions alike', () => {
        const f = buildLibraryFilter(params('view=nocaption'))
        expect(f).toMatchObject({ status: 'live', caption: { $in: [null, ''] } })
    })

    test('videos selects by kind, and an explicit kind filter still applies', () => {
        expect(buildLibraryFilter(params('view=videos')).kind).toBe('video')
        expect(buildLibraryFilter(params('kind=image')).kind).toBe('image')
    })

    test('tree selections stack', () => {
        const f = buildLibraryFilter(params('year=2021&operation=4.+Op+Silent+Ridge&mission=I'))
        expect(f).toMatchObject({ year: '2021', operation: '4. Op Silent Ridge', mission: 'I' })
    })

    // The rail's Unknown tree node asks for "this field is absent" through a
    // dedicated boolean, not by overloading the string 'Unknown' — a real
    // document can hold that literal string (see the test below), so the
    // string channel has to keep meaning a literal match.
    test('yearUnset selects an absent year, not a literal match', () => {
        expect(buildLibraryFilter(params('yearUnset=true'))).toMatchObject({
            year: { $exists: false },
        })
    })

    test('operationUnset selects an absent operation, not a literal match', () => {
        expect(buildLibraryFilter(params('operationUnset=true'))).toMatchObject({
            operation: { $exists: false },
        })
    })

    // relocate.ts's undated-operation branch writes an operation's raw,
    // unvalidated title verbatim, so an admin can title a real Operation
    // exactly 'Unknown' and have it stored as that literal string. It must
    // still be reachable by a literal filter now that the string is no
    // longer overloaded as a sentinel.
    test('a literal year or operation of "Unknown" still matches literally', () => {
        expect(buildLibraryFilter(params('year=Unknown'))).toMatchObject({ year: 'Unknown' })
        expect(buildLibraryFilter(params('operation=Unknown'))).toMatchObject({ operation: 'Unknown' })
    })

    // Defensive rather than reachable through the UI (which never sends
    // both): the boolean must win unambiguously if it ever did, rather than
    // silently depending on object key order.
    test('yearUnset wins over a same-request literal year', () => {
        expect(buildLibraryFilter(params('year=2021&yearUnset=true')).year).toEqual({ $exists: false })
    })

    test('tag and author', () => {
        expect(buildLibraryFilter(params('tag=funny')).tags).toBe('funny')
        expect(buildLibraryFilter(params('author=Koda')).authorName).toBe('Koda')
    })

    // Three fields, because a member searching "chopper" means the caption,
    // and a reviewer searching "Koda" means the author.
    test('search spans caption, author and storage key, case-insensitively', () => {
        const f = buildLibraryFilter(params('q=chopper'))
        expect(f.$or).toEqual([
            { caption: { $regex: 'chopper', $options: 'i' } },
            { authorName: { $regex: 'chopper', $options: 'i' } },
            { storageKey: { $regex: 'chopper', $options: 'i' } },
        ])
    })

    // A caption is member-supplied text. Left unescaped, '.*' would scan the
    // whole collection and '(' would throw a driver error.
    test('search escapes regex metacharacters', () => {
        const f = buildLibraryFilter(params('q=a.%2Ab(c%5B'))
        expect(f.$or).toEqual([
            { caption: { $regex: 'a\\.\\*b\\(c\\[', $options: 'i' } },
            { authorName: { $regex: 'a\\.\\*b\\(c\\[', $options: 'i' } },
            { storageKey: { $regex: 'a\\.\\*b\\(c\\[', $options: 'i' } },
        ])
    })

    test('health is not a database view', () => {
        // The Health view reads gallery_health, not gallery_media — see Task 5.
        expect(buildLibraryFilter(params('view=health'))).toMatchObject({ status: 'live' })
    })
})

describe('buildLibrarySort', () => {
    // Every sort ends in _id. Without it Mongo's order between equal keys is
    // unspecified, so paging through 4,781 items can show one twice and skip
    // another — the archive has thousands of items sharing a takenAt.
    test('every sort has a stable tie-break', () => {
        for (const sort of ['newest', 'oldest', 'rated', 'operation'] as const) {
            expect(Object.keys(buildLibrarySort(sort)).at(-1)).toBe('_id')
        }
    })

    test('newest and oldest are opposite on takenAt', () => {
        expect(buildLibrarySort('newest').takenAt).toBe(-1)
        expect(buildLibrarySort('oldest').takenAt).toBe(1)
    })

    test('rated sorts by up-votes descending', () => {
        expect(buildLibrarySort('rated').up).toBe(-1)
    })

    test('operation sorts by year then operation', () => {
        const s = buildLibrarySort('operation')
        expect(Object.keys(s).slice(0, 2)).toEqual(['year', 'operation'])
    })
})

describe('PAGE_SIZE', () => {
    test('is 60', () => {
        expect(PAGE_SIZE).toBe(60)
    })
})
