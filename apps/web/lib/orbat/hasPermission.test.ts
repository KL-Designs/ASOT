import { describe, test, expect, beforeEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'

/**
 * The "Members" grant: a single permanent DepartmentRole under the pseudo
 * department `members`, whose permissions apply to anyone currently in the
 * ORBAT — callsign holders and reservists alike, active and inactive.
 *
 * Reservists are not a separate collection: they are `orbat_positions`
 * documents with `category: 'activeReservist' | 'inactiveReservist'`, so
 * "is in the ORBAT" is one query against that collection by `userId`. These
 * tests pin that, because the obvious cheaper reading — "has a position with
 * a roleId" — silently excludes a callsign position whose roleId was never
 * set, and the whole point of the Members role is that it has no exceptions.
 */

type Doc = Record<string, any>

/** `vi.hoisted`, because vi.mock's factory is hoisted above every other
 *  statement in the file and may only reach state hoisted with it. */
const state = vi.hoisted((): { positions: Doc[], orbatRoles: Doc[], departmentRoles: Doc[] } => ({
    positions: [], orbatRoles: [], departmentRoles: [],
}))

/** Understands only the filter shapes these two functions actually issue —
 *  a real query engine here would be more code than the thing under test. */
function matchesPosition(doc: Doc, filter: Doc): boolean {
    if (filter.userId !== undefined && doc.userId !== filter.userId) return false
    if (filter.roleId?.$ne === null && (doc.roleId === null || doc.roleId === undefined)) return false
    return true
}

function matchesDeptRole(doc: Doc, filter: Doc): boolean {
    const clauses: Doc[] = filter.$or ?? [filter]
    return clauses.some(clause => {
        if (clause.department?.$in && !clause.department.$in.includes(doc.department)) return false
        if (typeof clause.department === 'string' && clause.department !== doc.department) return false
        if (clause.isBase !== undefined && doc.isBase !== clause.isBase) return false
        if (clause._id?.$in && !clause._id.$in.some((id: unknown) => String(id) === String(doc._id))) return false
        return true
    })
}

vi.mock('@/lib/mongo', () => ({
    default: {
        orbatPositions: {
            find: (filter: Doc) => ({ toArray: async () => state.positions.filter(p => matchesPosition(p, filter)) }),
        },
        orbatRoles: {
            find: (filter: Doc) => ({
                toArray: async () => {
                    const ids = (filter._id?.$in ?? []).map(String)
                    return state.orbatRoles.filter(r => ids.includes(String(r._id)))
                },
            }),
        },
        departmentRoles: {
            find: (filter: Doc) => ({ toArray: async () => state.departmentRoles.filter(r => matchesDeptRole(r, filter)) }),
        },
    },
}))

const { hasPermission } = await import('./hasPermission')
const { hasPermissions } = await import('./hasPermissions')

const MEMBER_KEY = 'gallery.submit'
const ORBAT_ROLE_ID = new ObjectId('6a8000000000000000000001')

function user(id = 'u1'): User {
    return { id, departments: [], departmentRoleIds: [] } as unknown as User
}

/** The permanent Members role, as `ensureBaseRoles` seeds it. */
function seedMembersRole(permissions: string[] = [MEMBER_KEY]) {
    state.departmentRoles.push({
        _id: new ObjectId('6a9000000000000000000001'),
        department: 'members',
        name: 'Members',
        isBase: true,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions,
        linkedSlot: null,
    })
}

beforeEach(() => {
    state.positions = []
    state.orbatRoles = []
    state.departmentRoles = []
    delete process.env.OVERRIDE
})

describe('hasPermission — the Members grant', () => {
    test('a callsign position holder is granted the Members permissions', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'platoon11', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), MEMBER_KEY)).toBe(true)
    })

    test('an active reservist is granted the Members permissions', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'activeReservist', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), MEMBER_KEY)).toBe(true)
    })

    test('an inactive reservist is granted the Members permissions', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'inactiveReservist', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), MEMBER_KEY)).toBe(true)
    })

    test('a position whose roleId was never set still counts as being in the ORBAT', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'platoon12', roleId: null })

        expect(await hasPermission(user(), MEMBER_KEY)).toBe(true)
    })

    test('someone with no ORBAT position is not granted the Members permissions', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'someone-else', category: 'platoon11', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), MEMBER_KEY)).toBe(false)
    })

    test('a key the Members role does not carry is still refused to a member', async () => {
        seedMembersRole(['gallery.submit'])
        state.positions.push({ userId: 'u1', category: 'platoon11', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), 'backups.manage')).toBe(false)
    })

    test('the Members role does not leak into department-scoped grants', async () => {
        // A user who belongs to no department must not pick up the Members
        // role via the `departments` arm — it is not a department they can be
        // a member of, and `User.departments` will never contain it.
        seedMembersRole()
        state.departmentRoles.push({
            _id: new ObjectId('6a9000000000000000000002'),
            department: 'j1', name: 'J1 Base Role', isBase: true,
            discordRoleIds: [], tsGroupIds: [], permissions: ['j1.only'], linkedSlot: null,
        })
        state.positions.push({ userId: 'u1', category: 'platoon11', roleId: ORBAT_ROLE_ID })

        expect(await hasPermission(user(), 'j1.only')).toBe(false)
    })

    test('the OVERRIDE list still bypasses everything', async () => {
        process.env.OVERRIDE = 'u1,u2'

        expect(await hasPermission(user(), 'anything.at.all')).toBe(true)
    })
})

describe('hasPermissions — the Members grant', () => {
    test('resolves Members keys for a member in the same batch as ORBAT role keys', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'platoon11', roleId: ORBAT_ROLE_ID })
        state.orbatRoles.push({ _id: ORBAT_ROLE_ID, name: 'Rifleman', permissions: ['attendance.confirm'] })

        expect(await hasPermissions(user(), [MEMBER_KEY, 'attendance.confirm', 'backups.manage']))
            .toEqual({ [MEMBER_KEY]: true, 'attendance.confirm': true, 'backups.manage': false })
    })

    test('refuses Members keys to someone with no ORBAT position', async () => {
        seedMembersRole()

        expect(await hasPermissions(user(), [MEMBER_KEY])).toEqual({ [MEMBER_KEY]: false })
    })

    test('an inactive reservist resolves Members keys', async () => {
        seedMembersRole()
        state.positions.push({ userId: 'u1', category: 'inactiveReservist', roleId: null })

        expect(await hasPermissions(user(), [MEMBER_KEY])).toEqual({ [MEMBER_KEY]: true })
    })
})
