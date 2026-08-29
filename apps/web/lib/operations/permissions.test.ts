import { describe, test, expect, vi, beforeEach } from 'vitest'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'

const hasPermission = vi.hoisted(() => vi.fn<(user: unknown, key: string) => Promise<boolean>>())
const hasRoles = vi.hoisted(() => vi.fn<(user: unknown, roles: string[]) => boolean>())

vi.mock('@/lib/orbat/hasPermission', () => ({ hasPermission }))
vi.mock('@/lib/discord', () => ({ default: { hasRoles } }))

const { can, canEach, OPERATION_CAPABILITIES } = await import('./permissions')
type Capability = keyof typeof OPERATION_CAPABILITIES

const ME = { id: '1', roles: [] } as unknown as User

beforeEach(() => {
    hasPermission.mockReset().mockResolvedValue(false)
    hasRoles.mockReset().mockReturnValue(false)
})

const ALL = Object.keys(OPERATION_CAPABILITIES) as Capability[]
const gated = ALL.filter(c => !OPERATION_CAPABILITIES[c].baseline)

describe('the capability table', () => {
    test('every capability names a permission key that actually exists', () => {
        // The whole point of the table is that the key is written down once.
        // A typo here is a gate that silently never opens.
        for (const cap of ALL) {
            expect(PERMISSION_KEYS, `${cap} -> ${OPERATION_CAPABILITIES[cap].key}`)
                .toContain(OPERATION_CAPABILITIES[cap].key)
        }
    })

    test('every legacy key it falls back to exists too', () => {
        for (const cap of ALL) {
            for (const key of OPERATION_CAPABILITIES[cap].legacyKeys ?? []) {
                expect(PERMISSION_KEYS, `${cap} legacy -> ${key}`).toContain(key)
            }
        }
    })

    test('every gated capability has a legacy arm', () => {
        // Without one it is false for everybody until somebody grants it, which
        // on deploy day means the operations area closes. See the file header.
        for (const cap of gated) {
            const rule = OPERATION_CAPABILITIES[cap]
            const arms = (rule.legacyKeys?.length ?? 0) + (rule.legacyRoles?.length ?? 0)
            expect(arms, `${cap} has no legacy arm`).toBeGreaterThan(0)
        }
    })

    test('no legacy Discord role array is empty', () => {
        // An empty array passes `hasRoles` for nobody, so a mistyped
        // `PERMISSIONS.x.y` that resolves to undefined would look like a rule
        // with a fallback while having none.
        for (const cap of ALL) {
            for (const roles of OPERATION_CAPABILITIES[cap].legacyRoles ?? []) {
                expect(Array.isArray(roles) && roles.length, `${cap}`).toBeGreaterThan(0)
            }
        }
    })
})

describe('baselines', () => {
    test('a public capability passes a logged-out visitor', async () => {
        await expect(can(null, 'map.view')).resolves.toBe(true)
        expect(hasPermission).not.toHaveBeenCalled()
    })

    test('a member capability passes anyone signed in, and nobody who is not', async () => {
        await expect(can(ME, 'attendance.claim')).resolves.toBe(true)
        await expect(can(null, 'attendance.claim')).resolves.toBe(false)
    })

    test('a baseline answers without going to the database', async () => {
        // A page asks most of this table at once; a member who passes on the
        // baseline should not cost two Mongo round trips per question.
        await can(ME, 'view')
        await can(ME, 'ocap.view')
        expect(hasPermission).not.toHaveBeenCalled()
        expect(hasRoles).not.toHaveBeenCalled()
    })

    test('every gated capability refuses a logged-out visitor outright', async () => {
        for (const cap of gated) {
            await expect(can(null, cap), cap).resolves.toBe(false)
        }
    })
})

describe('a gated capability', () => {
    test('passes on its own key', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.map.edit')
        await expect(can(ME, 'map.edit')).resolves.toBe(true)
    })

    test('passes on a legacy key when the new one is not granted', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.write')
        await expect(can(ME, 'orders.details')).resolves.toBe(true)
    })

    test('passes on a legacy Discord role when no key is granted', async () => {
        hasRoles.mockReturnValue(true)
        await expect(can(ME, 'schedule.view')).resolves.toBe(true)
    })

    test('fails when nothing matches', async () => {
        await expect(can(ME, 'orders.write')).resolves.toBe(false)
    })

    test('does not leak between capabilities', async () => {
        // Holding the map key must not open the schedule.
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.map.edit')
        await expect(can(ME, 'schedule.manage')).resolves.toBe(false)
        await expect(can(ME, 'orders.write')).resolves.toBe(false)
    })
})

describe('the split the whole change exists for', () => {
    test('orders.view does not imply orders.write', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.orders.view')
        await expect(can(ME, 'orders.view')).resolves.toBe(true)
        await expect(can(ME, 'orders.write')).resolves.toBe(false)
        await expect(can(ME, 'orders.details')).resolves.toBe(false)
    })

    test('schedule.manage does not imply the lifecycle override', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.schedule.manage')
        await expect(can(ME, 'schedule.manage')).resolves.toBe(true)
        await expect(can(ME, 'schedule.override')).resolves.toBe(false)
    })

    test('attendance.manage does not imply changing what positions exist', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'attendance.manage')
        await expect(can(ME, 'attendance.manage')).resolves.toBe(true)
        // ...but the reverse holds, because attendance.manage carried both
        // before this split and its holders must not lose the half they had.
        await expect(can(ME, 'attendance.roles')).resolves.toBe(true)
    })

    test('map.edit does not imply writing the orders', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.map.edit')
        await expect(can(ME, 'map.edit')).resolves.toBe(true)
        await expect(can(ME, 'orders.write')).resolves.toBe(false)
    })
})

describe('the legacy operationsEdit role still opens what it always opened', () => {
    test.each([
        'orders.view', 'orders.write', 'map.edit', 'schedule.view', 'ocap.manage',
    ] as const)('%s', async cap => {
        hasPermission.mockImplementation(async (_u, key) => key === 'pages.operationsEdit')
        await expect(can(ME, cap)).resolves.toBe(true)
    })
})

describe('canEach', () => {
    test('answers each capability asked for, and only those', async () => {
        hasPermission.mockImplementation(async (_u, key) => key === 'operations.orders.view')
        const out = await canEach(ME, ['orders.view', 'orders.write'] as const)
        expect(out).toEqual({ 'orders.view': true, 'orders.write': false })
    })

    test('handles a logged-out visitor', async () => {
        const out = await canEach(null, ['map.view', 'attendance.view'] as const)
        expect(out).toEqual({ 'map.view': true, 'attendance.view': false })
    })
})
