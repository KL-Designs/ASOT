/**
 * The selected loadout comes from a query string on a public page, so the
 * resolver has to survive anything typed into it and still put a kit on screen.
 */
import { describe, test, expect } from 'vitest'
import { pickLoadoutId, pickCardKit } from './select'

const LIST = [
    { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', isDefault: false },
    { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', isDefault: true },
    { id: 'cccccccccccccccccccccccc', isDefault: false },
]

describe('pickLoadoutId', () => {
    test('a member with no loadouts selects nothing', () => {
        expect(pickLoadoutId(undefined, [])).toBeNull()
        expect(pickLoadoutId('aaaaaaaaaaaaaaaaaaaaaaaa', [])).toBeNull()
    })

    test('an asked-for id wins over the default', () => {
        // This is the whole point of the picker: viewing must not demote the
        // member's nominated kit.
        expect(pickLoadoutId('cccccccccccccccccccccccc', LIST)).toBe('cccccccccccccccccccccccc')
    })

    test('no id falls back to the default', () => {
        expect(pickLoadoutId(undefined, LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
        expect(pickLoadoutId('', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
    })

    test('an unknown id falls back rather than rendering nothing', () => {
        expect(pickLoadoutId('not-an-id', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
        expect(pickLoadoutId('__proto__', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
        expect(pickLoadoutId('constructor', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
    })

    test('with no default at all, the first of the list is shown', () => {
        // Two concurrent PATCHes can interleave and leave a member with none;
        // the read side stays deterministic anyway.
        const none = LIST.map(l => ({ ...l, isDefault: false }))
        expect(pickLoadoutId(undefined, none)).toBe('aaaaaaaaaaaaaaaaaaaaaaaa')
    })

    test('with two defaults, the first of them is shown', () => {
        const two = LIST.map(l => ({ ...l, isDefault: true }))
        expect(pickLoadoutId(undefined, two)).toBe('aaaaaaaaaaaaaaaaaaaaaaaa')
    })

    test('a repeated query param takes the first value', () => {
        expect(pickLoadoutId(['cccccccccccccccccccccccc', 'aaaaaaaaaaaaaaaaaaaaaaaa'], LIST))
            .toBe('cccccccccccccccccccccccc')
        expect(pickLoadoutId(['nonsense', 'cccccccccccccccccccccccc'], LIST))
            .toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
        expect(pickLoadoutId([], LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
    })

    test('matching is exact', () => {
        expect(pickLoadoutId('CCCCCCCCCCCCCCCCCCCCCCCC', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
        expect(pickLoadoutId(' cccccccccccccccccccccccc', LIST)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
    })
})

describe('pickCardKit', () => {
    const kit = (name: string, isDefault: boolean, shared: boolean, day: number) =>
        ({ name, isDefault, shared, updatedAt: new Date(2026, 0, day) })

    test('prefers the default kit when it is public', () => {
        const kits = [kit('recent', false, true, 20), kit('fave', true, true, 1)]
        expect(pickCardKit(kits)?.name).toBe('fave')
    })

    test('a private default never wins — the newest public kit does', () => {
        const kits = [kit('fave', true, false, 1), kit('older', false, true, 5), kit('newer', false, true, 20)]
        expect(pickCardKit(kits)?.name).toBe('newer')
    })

    test('no public kit at all yields null', () => {
        expect(pickCardKit([kit('fave', true, false, 1), kit('other', false, false, 2)])).toBeNull()
    })

    test('an empty list yields null', () => {
        expect(pickCardKit([])).toBeNull()
    })

    test('input order does not decide the fallback', () => {
        // The caller may or may not have sorted. The rule is newest, not first.
        const kits = [kit('newer', false, true, 20), kit('older', false, true, 5)]
        const reversed = [kit('older', false, true, 5), kit('newer', false, true, 20)]
        expect(pickCardKit(kits)?.name).toBe('newer')
        expect(pickCardKit(reversed)?.name).toBe('newer')
    })
})
