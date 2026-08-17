/**
 * Names come from Arma's own configs, so the dictionary layer is not really
 * under test — the fallback is. It is what stands between a member equipping
 * something added after the dump and the panel rendering a blank row.
 */
import { describe, test, expect } from 'vitest'
import { resolveItemName, prettifyClassName, itemMeta } from './names'

describe('resolveItemName', () => {
    test('prefers the generated dictionary', () => {
        expect(resolveItemName('CUP_30Rnd_556x45_X95_Tracer_Green')).toBe('5.56mm 30Rnd X95 (Green tracer) Mag')
        expect(resolveItemName('MRH_SoldierTab')).toBe('P.D.A.')
    })

    test('falls back for a classname the dump never saw', () => {
        // A mod added after the dump must render as something, not nothing.
        expect(resolveItemName('CUP_arifle_MadeUpGun_black')).toBe('Made Up Gun Black')
    })

    test('an unresolvable classname still returns non-empty text', () => {
        expect(resolveItemName('___').length).toBeGreaterThan(0)
    })
})

describe('prettifyClassName', () => {
    test('strips vendor prefixes and type infixes', () => {
        expect(prettifyClassName('CUP_arifle_M4A3_black')).toBe('M4A3 Black')
        expect(prettifyClassName('ACE_optic_Hamr_2D')).toBe('Hamr 2D')
        expect(prettifyClassName('kat_chestSeal')).toBe('Chest Seal')
    })

    test('splits camelCase so kat_ items do not read as one word', () => {
        expect(prettifyClassName('kat_phenylephrineAuto')).toBe('Phenylephrine Auto')
    })

    test('returns the raw classname when nothing survives stripping', () => {
        expect(prettifyClassName('CUP_')).toBe('CUP_')
    })
})

describe('itemMeta', () => {
    test('exposes the config signals the classifier needs', () => {
        const meta = itemMeta('ASOT_adfrc_uniform_amcu')
        expect(meta?.type).toBe(801)
        expect(meta?.root).toBe('CfgWeapons')
    })

    test('returns null for an unknown classname', () => {
        expect(itemMeta('CUP_arifle_MadeUpGun_black')).toBeNull()
    })
})
