/**
 * The community kit index shows a count and four headline items per card, drawn
 * from kits members wrote in game rather than through any form here — so the
 * summariser has to survive an empty kit, a kit with nothing in its bags, and a
 * kit carrying nothing but bags.
 */
import { describe, test, expect } from 'vitest'
import { summariseLoadout } from './summary'
import type { ParsedLoadout, WeaponSlot, Container } from './parse'

function weapon(className: string, over: Partial<WeaponSlot> = {}): WeaponSlot {
    return {
        className,
        muzzle: null, pointer: null, optic: null, bipod: null,
        magazine: null, magazine2: null,
        ...over,
    }
}

function bag(className: string, contents: [string, number][] = []): Container {
    return { className, contents: contents.map(([c, count]) => ({ className: c, count, ammo: null })) }
}

const EMPTY: ParsedLoadout = {
    primary: null, launcher: null, handgun: null,
    uniform: null, vest: null, backpack: null,
    headgear: null, facewear: null, binocular: null,
    assigned: { map: null, gps: null, radio: null, compass: null, watch: null, nvg: null },
}

describe('summariseLoadout', () => {
    test('an empty kit summarises to nothing rather than throwing', () => {
        const s = summariseLoadout(EMPTY)
        expect(s.primary).toBeNull()
        expect(s.uniform).toBeNull()
        expect(s.itemCount).toBe(0)
    })

    test('the primary carries its attachments in arsenal order', () => {
        const s = summariseLoadout({
            ...EMPTY,
            primary: weapon('rhs_weap_mk18', { optic: 'optic_x', muzzle: 'muzzle_x', bipod: 'bipod_x' }),
        })
        expect(s.primary).toEqual({
            className: 'rhs_weap_mk18',
            attachments: ['muzzle_x', 'optic_x', 'bipod_x'],
        })
    })

    test('a stack of six magazines counts as six items, not one', () => {
        // Counting stacks would make a well-supplied rifleman read as lighter
        // than a sparse one.
        const s = summariseLoadout({ ...EMPTY, vest: bag('vest_x', [['mag', 6], ['grenade', 2]]) })
        expect(s.itemCount).toBe(6 + 2 + 1) // + the vest itself
    })

    test('worn and held gear counts even with empty bags', () => {
        const s = summariseLoadout({
            ...EMPTY,
            primary: weapon('rifle'),
            binocular: weapon('binos'),
            headgear: 'helmet',
            facewear: 'goggles',
            assigned: { ...EMPTY.assigned, map: 'map', radio: 'radio', nvg: 'nvg' },
        })
        expect(s.itemCount).toBe(7)
    })

    test('a container with no contents still counts itself', () => {
        expect(summariseLoadout({ ...EMPTY, backpack: bag('pack_x') }).itemCount).toBe(1)
        expect(summariseLoadout({ ...EMPTY, backpack: bag('pack_x') }).backpack).toBe('pack_x')
    })

    test('a non-finite stack count is skipped, not propagated as NaN', () => {
        // The count comes out of a member-pasted export; one bad stack must not
        // turn the whole card's count into "NaN items".
        const broken: ParsedLoadout = {
            ...EMPTY,
            uniform: { className: 'uni', contents: [{ className: 'x', count: NaN, ammo: null }, { className: 'y', count: 3, ammo: null }] },
        }
        expect(summariseLoadout(broken).itemCount).toBe(4)
    })
})
