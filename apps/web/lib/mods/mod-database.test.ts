import { describe, expect, test } from 'vitest'
import { cleanModUrl, matchesModSearch, normaliseModUrl, sanitiseMod } from './mod-database'

describe('sanitiseMod', () => {
    test('a new entry needs a name and defaults to testing', () => {
        expect(sanitiseMod({}).error).toBe('A mod needs a name.')
        expect(sanitiseMod({ name: '  ACE3  ' }).fields).toEqual({
            name: 'ACE3', workshopUrl: null, status: 'testing', notes: '', testedByName: '', testedOn: '',
        })
    })

    test('keeps what was given', () => {
        const { fields, error } = sanitiseMod({
            name: 'ACE3', workshopUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=463939057',
            status: 'known_issues', notes: 'Medical menu desyncs.', testedByName: 'Koda', testedOn: '2026-10-01',
        })
        expect(error).toBeNull()
        expect(fields.status).toBe('known_issues')
        expect(fields.testedOn).toBe('2026-10-01')
    })

    test('refuses a link that is not a web address, an unknown status and a bad date', () => {
        expect(sanitiseMod({ name: 'X', workshopUrl: 'javascript:alert(1)' }).error).toMatch(/web address/)
        expect(sanitiseMod({ name: 'X', status: 'banned' }).error).toBe('Unknown status.')
        expect(sanitiseMod({ name: 'X', testedOn: 'yesterday' }).error).toMatch(/date/)
    })

    test('an edit only touches what was sent', () => {
        expect(sanitiseMod({ status: 'approved' }, true)).toEqual({ fields: { status: 'approved' }, error: null })
    })

    test('an edit cannot blank the name', () => {
        expect(sanitiseMod({ name: '   ' }, true).error).toBe('A mod needs a name.')
    })
})

describe('links', () => {
    test('cleanModUrl keeps http(s) and nothing else', () => {
        expect(cleanModUrl(' https://example.com/mod ')).toBe('https://example.com/mod')
        expect(cleanModUrl('ftp://example.com')).toBeNull()
        expect(cleanModUrl('')).toBeNull()
    })

    test('the same Workshop page matches itself however it was pasted', () => {
        const a = normaliseModUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=463939057')
        const b = normaliseModUrl('http://www.steamcommunity.com/sharedfiles/filedetails/?id=463939057/')
        expect(a).toBe(b)
    })
})

describe('matchesModSearch', () => {
    const mod = { name: 'ACE3', notes: 'Medical menu desyncs on JIP.', testedByName: 'Koda' }

    test('looks in the name, the notes and the tester', () => {
        expect(matchesModSearch(mod, 'ace')).toBe(true)
        expect(matchesModSearch(mod, 'DESYNC')).toBe(true)
        expect(matchesModSearch(mod, 'koda')).toBe(true)
        expect(matchesModSearch(mod, 'tfar')).toBe(false)
    })

    test('an empty search matches everything', () => {
        expect(matchesModSearch(mod, '  ')).toBe(true)
    })
})
