import { describe, test, expect } from 'vitest'
import { RANKS_FLAT } from '@asot/lib'
import { AWARDS } from './awards'
import {
    RANK_ALIASES, AWARD_ALIASES, ROLE_ALIASES,
    resolveRank, resolveAward, resolveRole,
} from './history-vocab'

const RANK_NAMES = new Set(RANKS_FLAT.map(r => r.name))
const AWARD_LABELS = new Set<string>(AWARDS.map(a => a.label))

describe('alias tables point at values that exist', () => {
    // The whole reason this module lives in lib/ rather than in a .mjs
    // migration script: an award renamed in awards.ts breaks the suite here
    // instead of silently importing a label that renders no ribbon.
    test('every rank alias resolves to a real rank name', () => {
        for (const [from, to] of Object.entries(RANK_ALIASES)) {
            expect(RANK_NAMES.has(to), `${from} -> ${to}`).toBe(true)
        }
    })

    test('every award alias resolves to a real award label', () => {
        for (const [from, to] of Object.entries(AWARD_ALIASES)) {
            expect(AWARD_LABELS.has(to), `${from} -> ${to}`).toBe(true)
        }
    })

    // A key that is already canonical means the canonical list moved and the
    // table was not updated — the alias is now shadowing a real value.
    test('no alias key is itself already canonical', () => {
        for (const from of Object.keys(RANK_ALIASES)) {
            expect(RANK_NAMES.has(from), `rank alias key ${from}`).toBe(false)
        }
        for (const from of Object.keys(AWARD_ALIASES)) {
            expect(AWARD_LABELS.has(from), `award alias key ${from}`).toBe(false)
        }
    })

    test('no alias maps a value to itself', () => {
        for (const [from, to] of Object.entries({ ...RANK_ALIASES, ...AWARD_ALIASES, ...ROLE_ALIASES })) {
            expect(from).not.toBe(to)
        }
    })
})

describe('resolveRank', () => {
    test('passes through a canonical name', () => {
        expect(resolveRank('Private Proficient')).toBe('Private Proficient')
    })

    test('corrects a known misspelling', () => {
        expect(resolveRank('Signallar')).toBe('Signaller')
        expect(resolveRank('Lance Bombadier')).toBe('Lance Bombardier')
    })

    test('corrects a renamed rank', () => {
        expect(resolveRank('Warrant Officer Class One')).toBe('Warrant Officer 1')
        expect(resolveRank('Second Lieutenant')).toBe('2nd Lieutenant')
        expect(resolveRank('Regimental Sergeant Major of ASOT')).toBe('RSM of ASOT')
    })

    test('trims surrounding whitespace', () => {
        expect(resolveRank('  Corporal  ')).toBe('Corporal')
    })

    // "Stone" is the member's own name pasted into the Rank column.
    test('returns null for an unknown rank', () => {
        expect(resolveRank('Stone')).toBeNull()
        expect(resolveRank('')).toBeNull()
    })
})

describe('resolveAward', () => {
    test('passes through a canonical label and supplies its type', () => {
        expect(resolveAward('Campaign Medallion')).toEqual({
            name: 'Campaign Medallion',
            type: 'Operational Service Citation',
        })
    })

    test('collapses the five spellings of the 1 year citation', () => {
        for (const spelling of [
            '1 Year Citation', '1 Year of Service Citation', '1 Year service Citation',
            'One Year Service Citation', 'Year Service Citation',
        ]) {
            expect(resolveAward(spelling)?.name).toBe('1 Year Service Citation')
        }
    })

    test('maps the Tier 2 clasps onto the Fifth-to-Eighth numbering', () => {
        expect(resolveAward('Campaign Medallion, Tier 2 First Clasp')?.name).toBe('Campaign Medallion, Fifth Clasp')
        expect(resolveAward('Campaign Medallion Tier 2, Second Clasp')?.name).toBe('Campaign Medallion, Sixth Clasp')
        expect(resolveAward('Campaign Medallion, Tier 2 Third Clasp')?.name).toBe('Campaign Medallion, Seventh Clasp')
        expect(resolveAward('Campaign Medallion Tier 2, Fourth Clasp')?.name).toBe('Campaign Medallion, Eighth Clasp')
    })

    test('maps Long Term Service Citation to the 4 Year+ award', () => {
        expect(resolveAward('Long Term Service Citation')?.name).toBe('4 Year+ Service Citation')
        expect(resolveAward('4 Year Service Citation')?.name).toBe('4 Year+ Service Citation')
    })

    test('returns null for an unknown award', () => {
        expect(resolveAward('Order of the Phoenix')).toBeNull()
        expect(resolveAward('')).toBeNull()
    })
})

describe('resolveRole', () => {
    test('aliases a role that still exists under another name', () => {
        expect(resolveRole('Machine Gunner')).toBe('Machinegunner')
        expect(resolveRole('Section Medic')).toBe('Rifleman (CFA)')
        expect(resolveRole('Game Master')).toBe('Zeus')
        expect(resolveRole('Aircrewman')).toBe('Crewman')
        expect(resolveRole('Engineer')).toBe('Sapper')
    })

    test('collapses every driver/rifleman spelling to Rifleman', () => {
        for (const spelling of ['Rifleman/Driver', 'Driver/Rifleman', 'Driver / Rifleman', 'Driver/ Rifleman']) {
            expect(resolveRole(spelling)).toBe('Rifleman')
        }
    })

    // A service record states what the member actually held. Bending
    // "Battery Commander" into a surviving catalog entry would record a
    // posting that never happened.
    test('preserves a billet the unit no longer has', () => {
        for (const historical of [
            'Battery Commander', 'Battery 3IC', 'Aviation Commander', 'Wing Leader',
            'Company Executive Officer', 'Trooper', 'Trooper/Driver', 'Driver',
            'Gunnery Sergeant', 'Sapper (CFA)', 'Engineer Sergeant',
        ]) {
            expect(resolveRole(historical)).toBe(historical)
        }
    })

    test('returns an empty string for an empty cell', () => {
        expect(resolveRole('')).toBe('')
        expect(resolveRole('   ')).toBe('')
    })
})
