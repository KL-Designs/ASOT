import { describe, test, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `members` is a pseudo-department: it lives in this catalog and is edited
 * through the same Departments tab, but nobody is ever assigned a role under
 * it — `hasPermission` resolves its single permanent base role from the
 * user's ORBAT position instead.
 *
 * Two things follow, and both are pinned here. It has to be seeded like the
 * seven real departments, so the tab always has a Members row to click. And
 * it must never accept a sub-role, because "a sub-role of everyone in the
 * ORBAT" is not something a member could hold — there is no assignment
 * mechanism that would ever grant it.
 */

type Doc = Record<string, any>

/** `vi.hoisted`, because vi.mock's factory is hoisted above every other
 *  statement in the file and may only reach state hoisted with it. */
const state = vi.hoisted((): { roles: Doc[] } => ({ roles: [] }))

function matches(doc: Doc, filter: Doc): boolean {
    return Object.entries(filter).every(([k, v]) => {
        if (k === '_id') return String(doc._id) === String(v)
        return doc[k] === v
    })
}

vi.mock('@/lib/mongo', () => ({
    default: {
        departmentRoles: {
            find: (filter: Doc = {}) => {
                const chain: any = {
                    project: () => chain,
                    sort: () => chain,
                    toArray: async () => state.roles.filter(r => matches(r, filter)),
                }
                return chain
            },
            findOne: async (filter: Doc) => state.roles.find(r => matches(r, filter)) ?? null,
            insertMany: async (docs: Doc[]) => { state.roles.push(...docs); return {} },
            insertOne: async (doc: Doc) => { state.roles.push(doc); return {} },
        },
    },
}))

vi.mock('@/lib/discord', () => ({
    default: {
        fetchMe: async () => ({ id: 'admin-1', username: 'admin', globalName: null, guild: null }),
        hasRoles: () => true,
    },
}))

const { GET, POST } = await import('./route')

function get(url = 'https://ci.invalid/api/admin/department-roles') {
    return GET(new NextRequest(url))
}

function post(body: Doc) {
    return POST(new NextRequest('https://ci.invalid/api/admin/department-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }))
}

beforeEach(() => { state.roles = [] })

describe('department-roles catalog — the Members pseudo-department', () => {
    test('GET seeds a permanent Members base role alongside the real departments', async () => {
        await get()

        const members = state.roles.filter(r => r.department === 'members')
        expect(members).toHaveLength(1)
        expect(members[0]).toMatchObject({ name: 'Members', isBase: true, linkedSlot: null })
    })

    test('seeding is idempotent — a second GET does not add a second Members role', async () => {
        await get()
        await get()

        expect(state.roles.filter(r => r.department === 'members')).toHaveLength(1)
    })

    test('the seeded Members role is returned by GET', async () => {
        const body = await (await get()).json()

        expect(body.roles.some((r: Doc) => r.department === 'members' && r.isBase)).toBe(true)
    })

    test('?department=members returns just the Members role', async () => {
        const body = await (await get('https://ci.invalid/api/admin/department-roles?department=members')).json()

        expect(body.roles).toHaveLength(1)
        expect(body.roles[0].department).toBe('members')
    })

    test('POST refuses to create a sub-role under members', async () => {
        const res = await post({ department: 'members', name: 'Some Sub-Role' })

        expect(res.status).toBe(400)
    })

    test('POST still creates sub-roles under a real department', async () => {
        const res = await post({ department: 'j1', name: 'Recruiter', permissions: [] })

        expect(res.status).toBe(200)
        expect(state.roles.some(r => r.department === 'j1' && r.name === 'Recruiter' && !r.isBase)).toBe(true)
    })

    test('the seven real departments are still seeded', async () => {
        await get()

        const seeded = state.roles.filter(r => r.isBase).map(r => r.department).sort()
        expect(seeded).toEqual(['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7', 'members'])
    })
})

