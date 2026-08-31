import { describe, test, expect, beforeEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'

/**
 * The Permissions Explorer resolves grants in parallel to `hasPermission` —
 * a second implementation of the same rules, because it has to answer for
 * every member at once and say *why*. Any arm that exists in one and not the
 * other makes the Explorer lie, and the Explorer is the tool an admin opens
 * precisely when they are asking why somebody can do something.
 *
 * So the Members role has to be reachable here on the same terms it is
 * reachable in hasPermission: from holding an ORBAT position, not from
 * `User.departments`, which can never contain it.
 */

type Doc = Record<string, any>

/** `vi.hoisted`, because vi.mock's factory is hoisted above every other
 *  statement in the file and may only reach state hoisted with it. */
const state = vi.hoisted((): { users: Doc[], roles: Doc[], positions: Doc[], orbatRoles: Doc[], departmentRoles: Doc[] } => ({
    users: [], roles: [], positions: [], orbatRoles: [], departmentRoles: [],
}))

const collection = (rows: () => Doc[]) => ({
    find: () => ({ toArray: async () => rows() }),
    findOne: async (filter: Doc) => rows().find(r => r.id === filter.id) ?? null,
})

vi.mock('@/lib/mongo', () => ({
    default: {
        users: collection(() => state.users),
        roles: collection(() => state.roles),
        orbatPositions: collection(() => state.positions),
        orbatRoles: collection(() => state.orbatRoles),
        departmentRoles: collection(() => state.departmentRoles),
    },
}))

const { buildMemberGrants } = await import('./tree')

const MEMBERS_ROLE_ID = new ObjectId('6a9000000000000000000001')
const J1_BASE_ID = new ObjectId('6a9000000000000000000002')
const KEY = 'gallery.submit'

function seedMembersRole(permissions: string[] = [KEY]) {
    state.departmentRoles.push({
        _id: MEMBERS_ROLE_ID, department: 'members', name: 'Members', isBase: true, permissions,
    })
}

beforeEach(() => {
    state.users = [{ id: 'u1', guild: { roles: [] }, departments: [], departmentRoleIds: [] }]
    state.roles = []
    state.positions = []
    state.orbatRoles = []
    state.departmentRoles = []
    delete process.env.OVERRIDE
})

describe('buildMemberGrants — the Members role', () => {
    test('a member holding an ORBAT position is granted the Members keys', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', roleId: null, category: 'platoon11' })

        const grants = await buildMemberGrants('u1')

        expect(grants![KEY].granted).toBe(true)
    })

    test('the grant is attributed to the Members role, not to nothing', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', roleId: null, category: 'platoon11' })

        const grants = await buildMemberGrants('u1')

        expect(grants![KEY].viaDepartmentRoles).toContain(String(MEMBERS_ROLE_ID))
    })

    test('a reservist is granted the Members keys', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', roleId: null, category: 'inactiveReservist' })

        const grants = await buildMemberGrants('u1')

        expect(grants![KEY].granted).toBe(true)
    })

    test('someone with no ORBAT position is not granted the Members keys', async () => {
        seedMembersRole()

        const grants = await buildMemberGrants('u1')

        expect(grants![KEY].granted).toBe(false)
        expect(grants![KEY].viaDepartmentRoles).toEqual([])
    })

    test('a department base role is still attributed to the department', async () => {
        state.users = [{ id: 'u1', guild: { roles: [] }, departments: ['j1'], departmentRoleIds: [] }]
        state.departmentRoles.push({ _id: J1_BASE_ID, department: 'j1', name: 'J1 Base Role', isBase: true, permissions: ['gallery.review'] })

        const grants = await buildMemberGrants('u1')

        expect(grants!['gallery.review']?.viaDepartmentRoles ?? []).toContain(String(J1_BASE_ID))
    })
})
