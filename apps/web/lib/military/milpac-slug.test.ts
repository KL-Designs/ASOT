/**
 * Milpacs are shared by URL, so what a URL resolves to is a promise to whoever
 * clicked it. Two facts from the live data shape these rules:
 *
 *   - 37 name slugs are claimed by more than one member, 14 of them by two or
 *     more *serving* members ("goose" is three people). A name is therefore not
 *     an identifier, and the slug layer must never guess between claimants.
 *   - No name slug collides with a different member's Discord username, so
 *     username-first resolution can never shadow someone else's name URL.
 */
import { describe, test, expect } from 'vitest'
import { milpacSlug, buildSlugIndex, type SlugCandidate } from './milpac-slug'

const member = (over: Partial<SlugCandidate> & { id: string; username: string; name: string }): SlugCandidate => ({
    discharged: false,
    skeleton: false,
    ...over,
})

describe('milpacSlug', () => {
    test('lowercases the ASOT name', () => {
        expect(milpacSlug('Koda')).toBe('koda')
        expect(milpacSlug('AgentDove')).toBe('agentdove')
    })

    test('collapses runs of punctuation and whitespace to single hyphens', () => {
        expect(milpacSlug('TK_Jones')).toBe('tk-jones')
        expect(milpacSlug('Mitch  Mash')).toBe('mitch-mash')
        expect(milpacSlug('Rhino (LOA)')).toBe('rhino-loa')
    })

    test('does not leave a leading or trailing hyphen', () => {
        expect(milpacSlug('  Odin.  ')).toBe('odin')
        expect(milpacSlug('.velious')).toBe('velious')
        expect(milpacSlug('__k1')).toBe('k1')
    })

    test('folds accents to their base letters rather than dropping them', () => {
        // Dropping them would turn "Jörg" into "jrg"; folding keeps it readable
        // and keeps two visually distinct names distinct.
        expect(milpacSlug('Jörg')).toBe('jorg')
        expect(milpacSlug('Renée')).toBe('renee')
    })

    test('a name with nothing slug-worthy yields an empty string, not a stray hyphen', () => {
        // 11 live members produce this; they simply never claim a name URL.
        expect(milpacSlug('???')).toBe('')
        expect(milpacSlug('')).toBe('')
    })
})

describe('buildSlugIndex', () => {
    test('a name held by exactly one serving member is claimed', () => {
        const index = buildSlugIndex([
            member({ id: '1', username: 'itskodas', name: 'Koda' }),
            member({ id: '2', username: 'asotthomas', name: 'Thomas' }),
        ])
        expect(index.get('koda')).toBe('1')
        expect(index.get('thomas')).toBe('2')
    })

    test('a name held by two serving members is claimed by neither', () => {
        // The whole group falls back to username URLs. Picking a winner would
        // silently point one member's shared link at someone else.
        const index = buildSlugIndex([
            member({ id: '1', username: 'mastergoose123', name: 'Goose' }),
            member({ id: '2', username: 'goosethetwingo', name: 'Goose' }),
            member({ id: '3', username: 'sebastapol5', name: 'Goose' }),
        ])
        expect(index.has('goose')).toBe(false)
    })

    test('discharged and skeleton members do not claim, so a lone serving member still wins', () => {
        const index = buildSlugIndex([
            member({ id: '1', username: 'isobones', name: 'Bones' }),
            member({ id: '2', username: 'reality_bites', name: 'Bones', discharged: true }),
            member({ id: '3', username: 'csv_import', name: 'Bones', skeleton: true }),
        ])
        expect(index.get('bones')).toBe('1')
    })

    test('a name held only by non-claimants is not claimed at all', () => {
        const index = buildSlugIndex([
            member({ id: '1', username: 'old_hand', name: 'Ghost', discharged: true }),
        ])
        expect(index.has('ghost')).toBe(false)
    })

    test('members whose name produces an empty slug are ignored entirely', () => {
        // Two of them must not collide with each other on the empty key.
        const index = buildSlugIndex([
            member({ id: '1', username: 'a', name: '???' }),
            member({ id: '2', username: 'b', name: '' }),
        ])
        expect(index.has('')).toBe(false)
        expect(index.size).toBe(0)
    })

    test('slug claims are case- and punctuation-insensitive when detecting a clash', () => {
        // "Odin." and "odin" are the same claim, and must cancel each other out
        // rather than one quietly overwriting the other.
        const index = buildSlugIndex([
            member({ id: '1', username: 'odinv9.', name: 'Odin.' }),
            member({ id: '2', username: 'odin2456', name: 'odin' }),
        ])
        expect(index.has('odin')).toBe(false)
    })
})
