/**
 * Slot context is authoritative where it exists — an entry in the optic slot is
 * an optic whatever it is called. Only container contents need real inference,
 * and that is where a new mod can silently land in the wrong bucket, so the
 * rules are pinned here rather than eyeballed on the page.
 */
import { describe, test, expect } from 'vitest'
import { iconFor, ICON_KEYS } from './classify'

describe('iconFor', () => {
    test('slot context wins over any guess at the classname', () => {
        expect(iconFor('CUP_optic_Elcan_SpecterDR_KF_RMR_black', 'optic')).toBe('optic')
        expect(iconFor('CUP_acc_ANPEQ_15_Flashlight_Black_L', 'pointer')).toBe('pointer')
        expect(iconFor('CUP_bipod_VLTOR_Modpod_black', 'bipod')).toBe('bipod')
        expect(iconFor('ItemMap', 'map')).toBe('map')
        expect(iconFor('TFAR_rf7800str', 'radio')).toBe('radio')
    })

    test('uses ItemInfo.type for gear the dictionary knows', () => {
        expect(iconFor('ASOT_adfrc_uniform_amcu')).toBe('uniform')
        expect(iconFor('ASOT_adfrc_Peacekeeper_Mk5_AMCU')).toBe('vest')
        expect(iconFor('ASOT_adfrc_patrol_bullock_amcu_medic')).toBe('backpack')
    })

    test('ItemInfo.type 302 is not treated as bipod', () => {
        // Regression: 302 nominally means bipod, but 258 of the 324 entries
        // carrying it are CBA/ACE misc items. Trusting it rendered tourniquets
        // and PDAs as bipods.
        expect(iconFor('ACE_tourniquet')).not.toBe('bipod')
        expect(iconFor('MRH_SoldierTab')).not.toBe('bipod')
    })

    test('classifies medical items out of container contents', () => {
        expect(iconFor('ACE_tourniquet')).toBe('tourniquet')
        expect(iconFor('ACE_packingBandage')).toBe('bandage')
        expect(iconFor('kat_IV_16')).toBe('iv')
        expect(iconFor('ACE_epinephrine')).toBe('syringe')
        expect(iconFor('kat_chestSeal')).toBe('chestseal')
        expect(iconFor('ACE_splint')).toBe('splint')
    })

    test('separates the throwables', () => {
        expect(iconFor('CUP_HandGrenade_M67')).toBe('grenade')
        expect(iconFor('SmokeShellPurple')).toBe('smoke')
        expect(iconFor('ACE_M84')).toBe('flashbang')
    })

    test('a magazine is a magazine even when unknown to the dictionary', () => {
        expect(iconFor('CUP_30Rnd_556x45_X95_Tracer_Green')).toBe('magazine')
    })

    test('anything unrecognised gets the generic item mark, never empty', () => {
        const key = iconFor('some_mod_thing_nobody_has_seen')
        expect(key).toBe('item')
        expect(ICON_KEYS).toContain(key)
    })

    test('every key it can return is in ICON_KEYS', () => {
        const samples = ['ACE_tourniquet', 'SmokeShell', 'ItemMap', 'ASOT_adfrc_uniform_amcu', 'zzz_unknown']
        for (const s of samples) expect(ICON_KEYS).toContain(iconFor(s))
    })

    test('flavour words in a classname do not beat what the item actually is', () => {
        // Each of these matched a rule meant for something else. See the comments
        // in classify.ts — all four were found in the real dictionary, not imagined.
        expect(iconFor('SMG_01_F', 'primary')).not.toBe('mg')
        expect(iconFor('kat_ketamine')).not.toBe('explosive')
        expect(iconFor('UAS_BASE_762N_DSG_GPS_5Rnd')).toBe('magazine')
        expect(iconFor('UAS_BASE_762N_ABC_Explosive_5Rnd')).toBe('magazine')
        expect(iconFor('UAS_BASE_PLASMA_XAR15')).toBe('magazine')
        expect(iconFor('MineDetector')).toBe('tool')
    })

    test('genuine throwables still classify as throwables', () => {
        expect(iconFor('SmokeShell')).toBe('smoke')
        expect(iconFor('ACE_M84')).toBe('flashbang')
        expect(iconFor('CUP_HandGrenade_M67')).toBe('grenade')
    })
})
