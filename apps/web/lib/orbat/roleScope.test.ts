import { describe, test, expect } from 'vitest'
import { roleAllowedIn, rolesFor } from './roleScope'

const role = (name: string, categories: string[] = []) => ({ name, categories })

describe('roleAllowedIn', () => {
    test('a role scoped to a category is allowed there', () => {
        expect(roleAllowedIn(role('Sapper', ['support']), 'support')).toBe(true)
    })

    test('a role scoped elsewhere is not allowed', () => {
        expect(roleAllowedIn(role('Sapper', ['support']), 'platoon11')).toBe(false)
    })

    test('an unscoped role is allowed anywhere', () => {
        // `categories: []` means "usable in every category" — the ORBAT's own
        // convention, not an absence of configuration.
        expect(roleAllowedIn(role('Rifleman'), 'platoon11')).toBe(true)
        expect(roleAllowedIn(role('Rifleman'), 'gamemaster')).toBe(true)
    })

    test('a role scoped to several categories is allowed in each', () => {
        const r = role('Medic', ['platoon11', 'platoon12'])
        expect(roleAllowedIn(r, 'platoon11')).toBe(true)
        expect(roleAllowedIn(r, 'platoon12')).toBe(true)
        expect(roleAllowedIn(r, 'support')).toBe(false)
    })
})

describe('rolesFor', () => {
    test('keeps only the roles usable in the category, in the order given', () => {
        const roles = [
            role('Sapper', ['support']),
            role('Rifleman'),
            role('Zeus', ['gamemaster']),
            role('Medic', ['platoon11', 'support']),
        ]
        expect(rolesFor(roles, 'support').map(r => r.name)).toEqual(['Sapper', 'Rifleman', 'Medic'])
    })

    test('a category nothing is scoped to still gets the unscoped roles', () => {
        expect(rolesFor([role('Sapper', ['support']), role('Rifleman')], 'platoon12').map(r => r.name))
            .toEqual(['Rifleman'])
    })
})
