import { describe, test, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { grantBundlesFor, type GrantCatalog } from './grant-bundles'

/**
 * The expected-grant assembly the Member Sync report and its Apply button
 * both run on. Pure by construction — it takes already-loaded catalogs, so
 * these tests need no database, no Discord and no TeamSpeak.
 *
 * The Members role is the reason this was pulled out of member-sync.ts: its
 * grants are owed to anyone holding an ORBAT position, which is a rule worth
 * being able to test directly rather than through a function that opens a
 * TeamSpeak connection first.
 */

const ORBAT_ROLE_ID = new ObjectId('6a8000000000000000000001')
const J1_SUB_ROLE_ID = new ObjectId('6a8000000000000000000002')

function deptRole(over: Record<string, any>): any {
    return { _id: new ObjectId(), isBase: false, discordRoleIds: [], tsGroupIds: [], permissions: [], linkedSlot: null, ...over }
}

function catalog(over: Partial<GrantCatalog> = {}): GrantCatalog {
    return {
        deptBaseByDept: new Map(),
        deptRoleById: new Map(),
        orbatRoleById: new Map(),
        positionByUserId: new Map(),
        sectionMetaByKey: new Map(),
        ...over,
    }
}

const membersRole = deptRole({
    department: 'members', name: 'Members', isBase: true,
    discordRoleIds: ['discord-member'], tsGroupIds: [77],
})

function user(over: Record<string, any> = {}): any {
    return { id: 'u1', departments: [], departmentRoleIds: [], ...over }
}

describe('grantBundlesFor — the Members role', () => {
    test('a callsign position holder is owed the Members grants', () => {
        const bundles = grantBundlesFor(user(), catalog({
            deptBaseByDept: new Map([['members', membersRole]]),
            positionByUserId: new Map([['u1', { category: 'platoon11', roleId: ORBAT_ROLE_ID } as any]]),
        }))

        expect(bundles).toContainEqual(expect.objectContaining({
            discordRoleIds: ['discord-member'], tsGroupIds: [77],
        }))
    })

    test('a reservist is owed the Members grants', () => {
        const bundles = grantBundlesFor(user(), catalog({
            deptBaseByDept: new Map([['members', membersRole]]),
            positionByUserId: new Map([['u1', { category: 'inactiveReservist', roleId: null } as any]]),
        }))

        expect(bundles.flatMap(b => b.discordRoleIds)).toContain('discord-member')
    })

    test('someone with no ORBAT position is owed nothing from the Members role', () => {
        const bundles = grantBundlesFor(user(), catalog({
            deptBaseByDept: new Map([['members', membersRole]]),
        }))

        expect(bundles).toEqual([])
    })

    test('the Members bundle names itself as its source', () => {
        const bundles = grantBundlesFor(user(), catalog({
            deptBaseByDept: new Map([['members', membersRole]]),
            positionByUserId: new Map([['u1', { category: 'platoon11', roleId: null } as any]]),
        }))

        expect(bundles[0].source).toMatch(/member/i)
    })

    test('a department member does not pick up Members grants without a position', () => {
        // `User.departments` can never contain 'members' — it is not a
        // department anyone is a member of — but the department arm looks up
        // by code, so pin that it cannot be reached that way.
        const bundles = grantBundlesFor(user({ departments: ['members'] }), catalog({
            deptBaseByDept: new Map([['members', membersRole]]),
        }))

        expect(bundles.flatMap(b => b.discordRoleIds)).not.toContain('discord-member')
    })
})

describe('grantBundlesFor — the existing arms are unchanged', () => {
    test('a department base role is owed to a member of that department', () => {
        const j1Base = deptRole({ department: 'j1', name: 'J1 Base Role', isBase: true, discordRoleIds: ['d-j1'], tsGroupIds: [1] })
        const bundles = grantBundlesFor(user({ departments: ['j1'] }), catalog({
            deptBaseByDept: new Map([['j1', j1Base]]),
        }))

        expect(bundles).toEqual([{ discordRoleIds: ['d-j1'], tsGroupIds: [1], source: 'Department: J1 base role' }])
    })

    test('a department sub-role is ignored unless the user is in that department', () => {
        const sub = deptRole({ _id: J1_SUB_ROLE_ID, department: 'j1', name: 'Recruiter', discordRoleIds: ['d-rec'] })
        const bundles = grantBundlesFor(user({ departments: [], departmentRoleIds: [J1_SUB_ROLE_ID] }), catalog({
            deptRoleById: new Map([[String(J1_SUB_ROLE_ID), sub]]),
        }))

        expect(bundles).toEqual([])
    })

    test('an ORBAT position role contributes its grants', () => {
        const bundles = grantBundlesFor(user(), catalog({
            orbatRoleById: new Map([[String(ORBAT_ROLE_ID), { name: 'Rifleman', discordRoleIds: ['d-rifle'], tsGroupIds: [9] } as any]]),
            positionByUserId: new Map([['u1', { category: 'platoon11', roleId: ORBAT_ROLE_ID } as any]]),
        }))

        expect(bundles).toContainEqual({ discordRoleIds: ['d-rifle'], tsGroupIds: [9], source: 'ORBAT: Rifleman' })
    })

    test('category and section metadata each contribute their grants', () => {
        const bundles = grantBundlesFor(user(), catalog({
            positionByUserId: new Map([['u1', { category: 'platoon11', sectionTitle: 'Alpha', roleId: null } as any]]),
            sectionMetaByKey: new Map([
                ['platoon11:', { discordRoleId: 'd-cat', tsGroupId: 2 } as any],
                ['platoon11:Alpha', { discordRoleId: 'd-sec' } as any],
            ]),
        }))

        expect(bundles).toContainEqual({ discordRoleIds: ['d-cat'], tsGroupIds: [2], source: 'ORBAT category: platoon11' })
        expect(bundles).toContainEqual({ discordRoleIds: ['d-sec'], tsGroupIds: [], source: 'ORBAT section: Alpha' })
    })
})
