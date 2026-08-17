/**
 * The export is ARMA's getUnitLoadout wrapped by ACE. It is positional: slot 6
 * is headgear because it is sixth, not because anything in the data says so.
 * These tests pin the positions and the two container-stack forms, which are
 * the only places a silent misread is possible.
 */
import { describe, test, expect } from 'vitest'
import { parseLoadout, LoadoutParseError } from './parse'

/** A trimmed but structurally complete export: every slot populated. */
const SAMPLE = JSON.stringify([
    [
        ['CUP_arifle_M4A3_black', '', 'CUP_acc_ANPEQ_15_Flashlight_Black_L', 'CUP_optic_Elcan_SpecterDR_KF_RMR_black', ['CUP_30Rnd_556x45_X95_Tracer_Green', 30], [], 'CUP_bipod_VLTOR_Modpod_black'],
        [],
        ['BT01_F', '', '', '', ['Taser_mag', 2], [], ''],
        ['ASOT_adfrc_uniform_amcu', [['ACE_EarPlugs', 1], ['ACE_tourniquet', 8]]],
        ['ASOT_adfrc_Peacekeeper_Mk5_AMCU', [['Taser_mag', 4, 2], ['ACE_painkillers', 1, 10]]],
        ['ASOT_adfrc_patrol_bullock_amcu_medic', [['ACE_packingBandage', 50]]],
        'ASOT_adfrc_opscore_marine_Snakeskin_amcu_amp_5_Aus',
        'CUP_G_Scarf_Face_Tan',
        ['Rangefinder', '', '', '', [], [], ''],
        ['ItemMap', 'ItemGPS', 'TFAR_rf7800str', 'ItemCompass', 'TFAR_microdagr', 'CUP_NVG_GPNVG_black'],
    ],
    [['ace_arsenal_insignia', 'CUP_insignia_ua_krakenlowvis'], ['ace_earplugs', true]],
])

describe('parseLoadout', () => {
    test('reads the primary weapon and all four attachment slots', () => {
        const { primary } = parseLoadout(SAMPLE)
        expect(primary).toEqual({
            className: 'CUP_arifle_M4A3_black',
            muzzle: null,
            pointer: 'CUP_acc_ANPEQ_15_Flashlight_Black_L',
            optic: 'CUP_optic_Elcan_SpecterDR_KF_RMR_black',
            bipod: 'CUP_bipod_VLTOR_Modpod_black',
            magazine: { className: 'CUP_30Rnd_556x45_X95_Tracer_Green', ammo: 30 },
            magazine2: null,
        })
    })

    test('an empty weapon slot is null, not an empty object', () => {
        expect(parseLoadout(SAMPLE).launcher).toBeNull()
    })

    test('distinguishes an item stack from a magazine stack', () => {
        // ["ACE_painkillers",1,10] is ONE stack of ten uses, not ten stacks.
        const { vest } = parseLoadout(SAMPLE)
        expect(vest!.contents).toEqual([
            { className: 'Taser_mag', count: 4, ammo: 2 },
            { className: 'ACE_painkillers', count: 1, ammo: 10 },
        ])
        const { uniform } = parseLoadout(SAMPLE)
        expect(uniform!.contents[0]).toEqual({ className: 'ACE_EarPlugs', count: 1, ammo: null })
    })

    test('maps the positional slots to names', () => {
        const l = parseLoadout(SAMPLE)
        expect(l.headgear).toBe('ASOT_adfrc_opscore_marine_Snakeskin_amcu_amp_5_Aus')
        expect(l.facewear).toBe('CUP_G_Scarf_Face_Tan')
        expect(l.binocular!.className).toBe('Rangefinder')
        expect(l.backpack!.contents[0]).toEqual({ className: 'ACE_packingBandage', count: 50, ammo: null })
        expect(l.assigned).toEqual({
            map: 'ItemMap', gps: 'ItemGPS', radio: 'TFAR_rf7800str',
            compass: 'ItemCompass', watch: 'TFAR_microdagr', nvg: 'CUP_NVG_GPNVG_black',
        })
    })

    test('accepts a bare 10-element loadout with no ACE extras wrapper', () => {
        const bare = JSON.stringify(JSON.parse(SAMPLE)[0])
        expect(parseLoadout(bare).primary!.className).toBe('CUP_arifle_M4A3_black')
    })

    test('empty strings become null rather than empty slots', () => {
        const l = parseLoadout(SAMPLE)
        expect(l.handgun!.optic).toBeNull()
        expect(l.binocular!.magazine).toBeNull()
    })

    test('rejects non-JSON with a message a member can act on', () => {
        expect(() => parseLoadout('not an export')).toThrow(LoadoutParseError)
        expect(() => parseLoadout('not an export')).toThrow(/ACE arsenal export/)
    })

    test('rejects a JSON array of the wrong shape, naming the problem', () => {
        expect(() => parseLoadout('[1,2,3]')).toThrow(/10 a loadout has/)
    })
})
