import { describe, expect, test } from 'vitest'
import { existsSync } from 'fs'
import path from 'path'
import {
    DEFAULT_METIS, METIS_DASHABLE, METIS_DIRECTIONS, METIS_ECHELONS, METIS_ICONS, METIS_IDENTITIES, METIS_MOD1, METIS_MOD2,
    describeMetis, metisBearing, metisConfigSqf, metisCreateSqf, metisLayers, metisModifierNames, metisText,
    normaliseMetis, readMetis, writeMetis, type MetisMarker,
} from './metis'

const marker = (over: Partial<MetisMarker> = {}): MetisMarker => ({ ...DEFAULT_METIS, ...over })

/*
 * The ids are the point of the whole file: an entry's index is what the mod
 * calls it in game. These pin the ones a wrong edit would most plausibly move,
 * against Metis Marker 1.9.0's `initMarkerVariables.hpp`.
 */
describe('the lists match the mod, index for index', () => {
    test('icons', () => {
        expect(METIS_ICONS).toHaveLength(56)
        expect(METIS_ICONS[0].key).toBe('empty')
        expect(METIS_ICONS[1].key).toBe('infantry')
        expect(METIS_ICONS[4].key).toBe('armor')
        expect(METIS_ICONS[6].key).toBe('anti_armor_armored')
        expect(METIS_ICONS[12].key).toBe('rotary_wing')
        expect(METIS_ICONS[17].key).toBe('artillery')
        expect(METIS_ICONS[21].key).toBe('reconnaissance')
        expect(METIS_ICONS[30].key).toBe('medical')
        expect(METIS_ICONS[40].key).toBe('special_operation_forces')
        expect(METIS_ICONS[55].key).toBe('search_and_rescue')
    })

    test('modifiers, echelons and directions', () => {
        expect(METIS_MOD1.map(m => m.key)).toEqual([
            'empty', 'air_assault', 'attack', 'maintenance_top', 'multiple_rocket_launcher', 'single_rocket_launcher',
            'sniper', 'headquarters', 'naval_top', 'radar_top', 'bridging', 'medevac', 'eod_top',
        ])
        expect(METIS_MOD2.map(m => m.key)).toEqual([
            'empty', 'airborne', 'heavy', 'medium', 'light', 'mountain', 'vstol', 'wheeled', 'towed',
        ])
        expect(METIS_ECHELONS.map(e => e.key)).toEqual([
            'empty', 'team', 'squad', 'section', 'platoon', 'company', 'battalion', 'regiment',
            'brigade', 'division', 'corps', 'army', 'army_group',
        ])
        expect(METIS_DIRECTIONS).toHaveLength(16)
    })

    test('composite icons are built from the mod\'s layers', () => {
        expect(METIS_ICONS[2].layers).toEqual(['infantry', 'armor'])
        expect(METIS_ICONS[52].layers).toEqual(['main_gun_system', 'infantry', 'armor'])
        expect(METIS_ICONS[0].layers).toEqual([])
    })

    test('no key appears twice in a list', () => {
        for (const list of [METIS_ICONS, METIS_MOD1, METIS_MOD2]) {
            expect(new Set(list.map(e => e.key)).size).toBe(list.length)
        }
    })
})

describe('every texture the lists can ask for exists on the site', () => {
    const root = path.join(process.cwd(), 'public', 'markers', 'metis')
    const has = (layer: string) => existsSync(path.join(root, `${layer}.png`))

    test('frames, HQ staffs, echelons and modifiers, for all four identities', () => {
        const missing: string[] = []
        for (const { id } of METIS_IDENTITIES) {
            for (const frame of [`frame/${id}`, `frame/${id}_hq`]) if (!has(frame)) missing.push(frame)
            if (METIS_DASHABLE.includes(id) && !has(`frame/${id}_dash`)) missing.push(`frame/${id}_dash`)
            for (let n = 1; n < METIS_ECHELONS.length; n++) if (!has(`size/${id}_${n}`)) missing.push(`size/${id}_${n}`)
            const names = new Set([...METIS_ICONS, ...METIS_MOD1, ...METIS_MOD2].flatMap(e => e.layers))
            for (const name of names) if (!has(`mod/${id}_${name}`)) missing.push(`mod/${id}_${name}`)
        }
        for (const com of ['com/reinforced', 'com/reduced', 'com/reinforced_reduced']) if (!has(com)) missing.push(com)
        expect(missing).toEqual([])
    })
})

describe('normaliseMetis', () => {
    test('fills in a blank marker', () => {
        expect(normaliseMetis(null)).toEqual(DEFAULT_METIS)
    })

    test('an out-of-range id falls back to none rather than to a different unit', () => {
        expect(normaliseMetis({ icon: 999, mod1: -1, mod2: 3.5, echelon: 40 })).toMatchObject({ icon: 0, mod1: 0, mod2: 0, echelon: 0 })
    })

    test('neutral cannot be dashed, because the mod has no such frame', () => {
        expect(normaliseMetis({ identity: 'neu', dashed: true }).dashed).toBe(false)
        expect(normaliseMetis({ identity: 'red', dashed: true }).dashed).toBe(true)
    })

    test('an unknown identity, direction or condition is reset', () => {
        expect(normaliseMetis({ identity: 'grn', direction: 'UP', condition: 9 })).toMatchObject({ identity: 'blu', direction: '', condition: 0 })
    })
})

describe('metisText', () => {
    test('upper-cases and holds to six characters', () => {
        expect(metisText('alpha one')).toBe('ALPHA ')
        expect(metisText('1-1a')).toBe('1-1A')
    })

    test('drops characters the mod cannot draw, instead of losing the whole text in game', () => {
        expect(metisText('a!b?c')).toBe('ABC')
        expect(metisText('é1')).toBe('1')
    })
})

describe('drawing', () => {
    test('a bare frame', () => {
        expect(metisLayers(marker())).toEqual(['frame/blu'])
    })

    test('builds the family in the mod\'s order', () => {
        expect(metisLayers(marker({
            identity: 'red', dashed: true, hq: true, icon: 2, mod1: 2, mod2: 7, echelon: 4, reinforced: true,
        }))).toEqual([
            'frame/red_dash', 'frame/red_hq', 'size/red_4', 'com/reinforced',
            'mod/red_infantry', 'mod/red_armor', 'mod/red_attack', 'mod/red_wheeled',
        ])
    })

    test('reinforced and reduced together are one sign', () => {
        expect(metisLayers(marker({ reinforced: true, reduced: true }))).toContain('com/reinforced_reduced')
    })

    test('modifier names follow getAllModifiers', () => {
        expect(metisModifierNames({ icon: 24, mod1: 6, mod2: 1 })).toEqual(['missile', 'surface_surface', 'sniper', 'airborne'])
        expect(metisModifierNames({ icon: 0, mod1: 0, mod2: 0 })).toEqual([])
    })

    test('a direction is a bearing', () => {
        expect(metisBearing('N')).toBe(0)
        expect(metisBearing('E')).toBe(90)
        expect(metisBearing('NNW')).toBe(337.5)
        expect(metisBearing('')).toBeNull()
    })

    test('describes itself', () => {
        expect(describeMetis(marker({ icon: 2, echelon: 4, hq: true }))).toBe('Friendly mechanised infantry platoon (HQ)')
        expect(describeMetis(marker({ identity: 'red', dashed: true }))).toBe('Hostile suspected')
    })
})

describe('SQF', () => {
    test('the mod\'s own example round-trips', () => {
        // From fnc_createMarker.sqf: [["blu", false, false], [4,0,0], [4, false, true], ["3","3"], "9", ["4"]]
        const sqf = metisConfigSqf(marker({ icon: 4, echelon: 4, reduced: true, designation: '33', additionalInfo: '9', higherFormation: '4' }))
        expect(sqf).toBe('[["blu",false,false],[4,0,0],[4,false,true],["3","3"],"9",["4"],0,[],""]')
    })

    test('reinforced and reduced go in the echelon slot, HQ in the frame', () => {
        const sqf = metisConfigSqf(marker({ hq: true, echelon: 5, reinforced: true }))
        expect(sqf.startsWith('[["blu",false,true],[0,0,0],[5,true,false],')).toBe(true)
    })

    test('empty texts are empty arrays, and condition and direction are carried', () => {
        expect(metisConfigSqf(marker({ condition: 2, direction: 'SW' }))).toBe('[["blu",false,false],[0,0,0],[0,false,false],[],"",[],2,[],"SW"]')
    })

    test('a quote in the free text cannot end the string', () => {
        const sqf = metisConfigSqf(marker({ additionalInfo: 'he said "go"' }))
        expect(sqf).toContain('"he said  go"')
        expect(sqf.match(/"/g)?.length).toBe(6)
    })

    test('a complete call', () => {
        expect(metisCreateSqf(marker({ icon: 1 }), 1200.5, 3400))
            .toBe('[[1200.5,3400],-10,true,[["blu",false,false],[1,0,0],[0,false,false],[],"",[],0,[],""],1.3] call mts_markers_fnc_createMarker')
    })
})

describe('markers drawn with the old lists', () => {
    test('keep the picture their author saw', () => {
        // Old index 6 was drawn as Artillery; the mod's 6 is Anti-armour (armoured).
        expect(METIS_ICONS[readMetis({ a3Icon: 6 }).icon].key).toBe('artillery')
        expect(METIS_ICONS[readMetis({ a3Icon: 8 }).icon].key).toBe('rotary_wing')
        expect(METIS_ICONS[readMetis({ a3Icon: 12 }).icon].key).toBe('medical')
        expect(METIS_ICONS[readMetis({ a3Icon: 17 }).icon].key).toBe('special_operation_forces')
        // The first five happened to agree and must still.
        expect(readMetis({ a3Icon: 4 }).icon).toBe(4)
    })

    test('the old side "grn" is the mod\'s neutral', () => {
        expect(readMetis({ a3SideId: 'grn' }).identity).toBe('neu')
    })

    test('the old HQ / task force selector keeps only the HQ staff', () => {
        expect(readMetis({ a3HqTf: 1 }).hq).toBe(true)
        expect(readMetis({ a3HqTf: 5 }).hq).toBe(true)
        expect(readMetis({ a3HqTf: 3 }).hq).toBe(false)
        expect(readMetis({ a3HqTf: 0 }).hq).toBe(false)
    })

    test('old modifier 2, and the mobility types the mod does have', () => {
        expect(METIS_MOD2[readMetis({ a3Mod2: 1 }).mod2].key).toBe('airborne')
        expect(METIS_MOD2[readMetis({ a3Mod2: 2 }).mod2].key).toBe('mountain')
        expect(readMetis({ a3Mod2: 3 }).mod2).toBe(0)
        expect(METIS_MOD2[readMetis({ a3Mod1: 2 }).mod2].key).toBe('wheeled')
        expect(METIS_MOD2[readMetis({ a3Mod1: 5 }).mod2].key).toBe('towed')
        // The old mobility list was never a Metis modifier 1.
        expect(readMetis({ a3Mod1: 3 }).mod1).toBe(0)
    })

    test('the old scale was a multiplier on the mod\'s default', () => {
        expect(readMetis({ a3MetisScale: 1 }).scale).toBeCloseTo(1.3)
        expect(readMetis({ a3MetisV: 2, a3MetisScale: 1 }).scale).toBe(1)
    })

    test('a version 2 marker survives a write and a read', () => {
        const m = marker({
            identity: 'red', dashed: true, hq: true, icon: 21, mod1: 6, mod2: 4, echelon: 3,
            reinforced: true, designation: '2-1', additionalInfo: 'OBJ ANVIL', higherFormation: 'A', condition: 1, direction: 'NE', scale: 1.6,
        })
        expect(readMetis(writeMetis(m))).toEqual(m)
    })
})
