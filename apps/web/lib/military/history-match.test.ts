import { describe, test, expect } from 'vitest'
import { buildMemberIndex, resolveMembers, validateOverrides, type MatchCandidate } from './history-match'

const member = (over: Partial<MatchCandidate> & { _id: string; username: string }): MatchCandidate => ({ ...over })

describe('buildMemberIndex', () => {
    test('indexes a member by name, nickname, globalName and username', () => {
        const m = member({ _id: '1', username: 'itskodas', name: 'Koda', globalName: 'kd', nickname: 'PTE(S) Koda [J7]' })
        const index = buildMemberIndex([m])
        for (const key of ['koda', 'itskodas', 'kd']) {
            expect(index.get(key), key).toEqual([m])
        }
    })

    test('strips [tags] from a nickname', () => {
        const m = member({ _id: '1', username: 'a', nickname: 'Etched [OLD ACC]' })
        expect(buildMemberIndex([m]).get('etched')).toEqual([m])
    })

    // The parens branch of normalise() had no coverage at all. A real nickname
    // carrying a rank suffix like PTE(S) relies on it.
    test('strips (parens) from a nickname', () => {
        const m = member({ _id: '1', username: 'a', nickname: 'Koda (LOA)' })
        expect(buildMemberIndex([m]).get('koda')).toEqual([m])
    })

    // Both at once, in the shape the live roster actually uses.
    test('strips a rank suffix and a department tag together', () => {
        const m = member({ _id: '1', username: 'itskodas', nickname: 'PTE(S) Koda [J7]' })
        const index = buildMemberIndex([m])
        expect(index.get('pte koda')).toEqual([m])
        expect(index.get('koda')).toEqual([m])
    })

    // Dave and Grubby have no `name` and a nickname of "REC Dave" / "REC
    // Grubby". Without this key they do not resolve at all.
    test('also indexes a nickname with its rank abbreviation removed', () => {
        const m = member({ _id: '1', username: 'daveuhh', nickname: 'REC Dave' })
        expect(buildMemberIndex([m]).get('dave')).toEqual([m])
    })

    test('does not strip a leading word that is not a rank', () => {
        const m = member({ _id: '1', username: 'a', nickname: 'Big Dave' })
        const index = buildMemberIndex([m])
        expect(index.get('big dave')).toEqual([m])
        expect(index.get('dave')).toBeUndefined()
    })

    // buildOrbatLookup() overwrites on collision, which is how "Bones"
    // resolved to an account that joined in 2026 rather than the one holding
    // seven promotions. Collecting instead of overwriting is the entire
    // reason this module exists.
    test('collects every claimant of a contested key instead of overwriting', () => {
        const a = member({ _id: '1', username: 'reality_bites', name: 'Bones' })
        const b = member({ _id: '2', username: 'isobones', name: 'Bones' })
        expect(buildMemberIndex([a, b]).get('bones')).toEqual([a, b])
    })
})

describe('validateOverrides', () => {
    test('reports an override naming a username that does not exist', () => {
        const errors = validateOverrides([member({ _id: '1', username: 'bobittihaxs' })])
        expect(errors.some(e => e.includes('.gryphorim.'))).toBe(true)
    })

    test('passes when every override target is present', () => {
        const usernames = ['bobittihaxs', '.gryphorim.', 'nutpirom', 'salpacino', 'mastergoose123',
            'odinv9.', 'tally.enfield', 'reality_bites', 'falcon7589', 'farmingtons9', 'rjfrg']
        const members = usernames.map((username, i) => member({ _id: String(i), username }))
        expect(validateOverrides(members)).toEqual([])
    })
})

describe('resolveMembers', () => {
    const koda = member({ _id: '1', username: 'itskodas', name: 'Koda' })

    test('resolves a uniquely claimed name', () => {
        const { resolved, unresolved } = resolveMembers(['Koda'], [koda])
        expect(resolved.get('Koda')).toEqual(koda)
        expect(unresolved).toEqual([])
    })

    test('leaves a contested name unresolved rather than picking one', () => {
        const a = member({ _id: '1', username: 'a', name: 'Goose' })
        const b = member({ _id: '2', username: 'b', name: 'Goose' })
        const { resolved, unresolved } = resolveMembers(['Goose'], [a, b])
        expect(resolved.has('Goose')).toBe(false)
        expect(unresolved).toEqual(['Goose'])
    })

    test('an override beats a contested key', () => {
        const chosen = member({ _id: '1', username: 'mastergoose123', name: 'Goose' })
        const other = member({ _id: '2', username: 'goosethetwingo', name: 'Goose' })
        const { resolved, unresolved } = resolveMembers(['Goose'], [chosen, other])
        expect(resolved.get('Goose')).toEqual(chosen)
        expect(unresolved).toEqual([])
    })

    test('an override resolves a name the index cannot match at all', () => {
        const target = member({ _id: '1', username: 'nutpirom', name: 'Nutpirom' })
        expect(resolveMembers(['Nutpriom'], [target]).resolved.get('Nutpriom')).toEqual(target)
    })

    // Both of these silently merge two people's service records, and the
    // damage is unrecoverable once the old arrays are gone.
    test('errors when two CSV names resolve to the same member', () => {
        const dup = member({ _id: '1', username: 'nutpirom', name: 'Nutpirom' })
        const { errors } = resolveMembers(['Nutpriom', 'Nutpirom'], [dup])
        expect(errors.some(e => e.includes('Nutpriom') && e.includes('Nutpirom'))).toBe(true)
    })

    // Discriminating: every override target is present except one, so the error
    // can only come from that specific entry. The previous version of this test
    // passed a name that was not an override at all, and was satisfied by the
    // other ten entries being trivially absent from a one-member fixture.
    test('errors naming the one override target that does not exist', () => {
        const usernames = ['bobittihaxs', '.gryphorim.', 'nutpirom', 'salpacino', 'mastergoose123',
            'odinv9.', 'tally.enfield', 'reality_bites', 'falcon7589', 'farmingtons9']
        const members = usernames.map((username, i) => member({ _id: String(i), username }))
        const { errors, unresolved } = resolveMembers(['Formula'], members)

        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('rjfrg')
        expect(unresolved).toEqual(['Formula'])
    })
})
