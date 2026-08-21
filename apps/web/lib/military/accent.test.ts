/**
 * The priority order is the whole point of this module — a member who sets a
 * colour and still sees the old one has no way to tell whether it saved.
 */
import { describe, test, expect } from 'vitest'
import { DEFAULT_ACCENT, normaliseHex, resolveMemberAccent } from './accent'

const member = (profileAccent?: string | null, hexAccentColor = '#000000') =>
    ({ profileAccent, hexAccentColor }) as Pick<User, 'profileAccent' | 'hexAccentColor'>

describe('normaliseHex', () => {
    test('accepts six-digit hex with or without the hash, lower-cased', () => {
        expect(normaliseHex('#AABBCC')).toBe('#aabbcc')
        expect(normaliseHex('aabbcc')).toBe('#aabbcc')
        expect(normaliseHex('  #A1B2C3  ')).toBe('#a1b2c3')
    })

    test('rejects anything else', () => {
        for (const bad of ['#abc', 'red', 'rgb(1,2,3)', '#12345g', '', null, undefined, 42, {}]) {
            expect(normaliseHex(bad)).toBeNull()
        }
    })
})

describe('resolveMemberAccent', () => {
    test('the member\'s own pick wins over Discord', () => {
        expect(resolveMemberAccent(member('#3ddc84', '#ff4257'))).toBe('#3ddc84')
    })

    test('falls back to the Discord accent when no pick is set', () => {
        expect(resolveMemberAccent(member(null, '#ff4257'))).toBe('#ff4257')
        expect(resolveMemberAccent(member(undefined, '#ff4257'))).toBe('#ff4257')
    })

    /* The bug this replaces: Discord reports no accent as `#000000`, which the
       old `ensureVisible(hex || red)` turned into grey instead of unit red. */
    test('treats Discord\'s #000000 as no accent at all, not as black', () => {
        expect(resolveMemberAccent(member(null, '#000000'))).toBe(DEFAULT_ACCENT)
    })

    test('falls back to the unit red when nothing is set', () => {
        expect(resolveMemberAccent(member())).toBe(DEFAULT_ACCENT)
        expect(resolveMemberAccent(null)).toBe(DEFAULT_ACCENT)
        expect(resolveMemberAccent(undefined)).toBe(DEFAULT_ACCENT)
    })

    test('ignores a malformed stored pick rather than painting with it', () => {
        expect(resolveMemberAccent(member('not-a-colour', '#ff4257'))).toBe('#ff4257')
    })

    /* A chosen colour is still held to the legibility floor: every surface that
       uses this paints on near-black. */
    test('lifts a too-dark pick to the visible floor', () => {
        expect(resolveMemberAccent(member('#000000'))).toBe('#888888')
        expect(resolveMemberAccent(member('#0a0a14'))).not.toBe('#0a0a14')
    })

    test('leaves an already-bright pick untouched', () => {
        expect(resolveMemberAccent(member('#d8ac45'))).toBe('#d8ac45')
    })
})
