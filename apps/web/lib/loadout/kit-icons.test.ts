/**
 * The icon key is stored from a JSON body and then used as a `Record` lookup on
 * a public page, so an unrecognised or hostile value has to resolve to a real
 * mark rather than to `undefined` — or, worse, to something off the prototype.
 */
import { describe, test, expect } from 'vitest'
import { isKitIcon, kitIcon, KIT_ICON_KEYS, KIT_ICON_PATHS, DEFAULT_KIT_ICON } from './kit-icons'

describe('kit icons', () => {
    test('every key has a path and the default is one of them', () => {
        for (const key of KIT_ICON_KEYS) {
            expect(typeof KIT_ICON_PATHS[key]).toBe('string')
            expect(KIT_ICON_PATHS[key].length).toBeGreaterThan(0)
        }
        expect(KIT_ICON_KEYS).toContain(DEFAULT_KIT_ICON)
    })

    test('the set is big enough to be worth choosing from', () => {
        expect(KIT_ICON_KEYS.length).toBeGreaterThanOrEqual(10)
    })

    test('accepts a real key', () => {
        expect(isKitIcon('medic')).toBe(true)
        expect(kitIcon('medic')).toBe('medic')
    })

    test('rejects prototype keys rather than resolving them', () => {
        // `'__proto__' in KIT_ICON_PATHS` is true for a plain object literal;
        // the key-list check is what makes these fall through to the default.
        for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
            expect(isKitIcon(hostile)).toBe(false)
            expect(kitIcon(hostile)).toBe(DEFAULT_KIT_ICON)
        }
    })

    test('anything else falls back to the default', () => {
        for (const bad of [undefined, null, '', 'nope', 42, {}, ['medic']]) {
            expect(isKitIcon(bad)).toBe(false)
            expect(kitIcon(bad)).toBe(DEFAULT_KIT_ICON)
        }
    })

    test('matching is exact, not case-insensitive', () => {
        expect(isKitIcon('Medic')).toBe(false)
        expect(kitIcon('MEDIC')).toBe(DEFAULT_KIT_ICON)
    })
})
