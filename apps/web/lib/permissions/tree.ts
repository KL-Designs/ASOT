import Db from '@/lib/mongo'
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@/lib/permissions-catalog'

export interface PermissionDiscordRole {
    id: string
    name: string
    color: number
    resolved: boolean
}

export interface PermissionOrbatRole {
    id: string
    name: string
}

export interface PermissionDepartmentRole {
    id: string
    department: string
    name: string
}

export interface PermissionNodeStatic {
    key: string
    discordRoles: PermissionDiscordRole[]
    orbatRoles: PermissionOrbatRole[]
    departmentRoles: PermissionDepartmentRole[]
    memberCount: number
}

export interface PermissionCategory {
    key: string
    label: string
    permissions: PermissionNodeStatic[]
}

export interface PermissionGrant {
    granted: boolean
    viaDiscordRoles: string[]
    viaOrbatRoles: string[]
    viaDepartmentRoles: string[]
    viaGlobalOverride: boolean
}

interface ResolvedState {
    userIds: string[]
    userIdToRoleNames: Map<string, Set<string>>
    userIdToOrbatRoleIds: Map<string, Set<string>>
    orbatRoleIdToDoc: Map<string, { name: string; permissions: string[] }>
    roleNameToDoc: Map<string, { id: string; name: string; color: number }>
    overrideUserIds: Set<string>
    userIdToDepartments: Map<string, Set<string>>
    userIdToDepartmentRoleIds: Map<string, Set<string>>
    departmentRoleIdToDoc: Map<string, { name: string; department: string; isBase: boolean; permissions: string[] }>
    departmentBaseRoleIdByDept: Map<string, string>
}

// Shared by buildPermissionsTree() and buildMemberGrants() so both compute
// grants with identical logic to hasPermission() — additive: a global
// Discord-role bypass, OR a qualifying Discord role, OR an ORBAT position
// whose Role grants the key, OR a DepartmentRole (base or held sub-role)
// whose permissions include the key — the same three-way OR
// hasDepartmentPermission() itself checks for department-scoped keys like
// deptLinks.manage.
async function resolveState(): Promise<ResolvedState> {
    const [users, discordRoles, positions, orbatRoles, departmentRoles] = await Promise.all([
        Db.users.find(
            { discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { id: 1, 'guild.roles': 1, departments: 1, departmentRoleIds: 1 } }
        ).toArray(),
        Db.roles.find({}).toArray(),
        Db.orbatPositions.find(
            { roleId: { $ne: null }, userId: { $ne: null } },
            { projection: { userId: 1, roleId: 1 } }
        ).toArray(),
        Db.orbatRoles.find({}, { projection: { name: 1, permissions: 1 } }).toArray(),
        Db.departmentRoles.find({}, { projection: { name: 1, department: 1, isBase: 1, permissions: 1 } }).toArray(),
    ])

    const roleIdToDoc = new Map(discordRoles.map(r => [r.id, r]))
    const roleNameToDoc = new Map(discordRoles.map(r => [r.name, { id: r.id, name: r.name, color: r.color }]))

    const userIdToRoleNames = new Map<string, Set<string>>()
    for (const u of users) {
        const names = new Set<string>()
        for (const roleId of u.guild?.roles ?? []) {
            const doc = roleIdToDoc.get(roleId)
            if (doc) names.add(doc.name)
        }
        userIdToRoleNames.set(u.id, names)
    }

    const orbatRoleIdToDoc = new Map(orbatRoles.map(r => [String(r._id), { name: r.name, permissions: r.permissions }]))

    // A user can hold more than one ORBAT position — union every position's
    // Role so no grant is silently dropped.
    const userIdToOrbatRoleIds = new Map<string, Set<string>>()
    for (const pos of positions) {
        if (pos.userId && pos.roleId) {
            const set = userIdToOrbatRoleIds.get(pos.userId) ?? new Set<string>()
            set.add(String(pos.roleId))
            userIdToOrbatRoleIds.set(pos.userId, set)
        }
    }

    const overrideUserIds = new Set(
        (process.env.OVERRIDE?.split(',') ?? []).map(id => id.trim()).filter(Boolean)
    )

    const departmentRoleIdToDoc = new Map(
        departmentRoles.map(r => [String(r._id), { name: r.name, department: r.department, isBase: r.isBase, permissions: r.permissions }])
    )
    const departmentBaseRoleIdByDept = new Map<string, string>()
    for (const r of departmentRoles) {
        if (r.isBase) departmentBaseRoleIdByDept.set(r.department, String(r._id))
    }

    const userIdToDepartments = new Map<string, Set<string>>()
    const userIdToDepartmentRoleIds = new Map<string, Set<string>>()
    for (const u of users) {
        userIdToDepartments.set(u.id, new Set(u.departments ?? []))
        userIdToDepartmentRoleIds.set(u.id, new Set((u.departmentRoleIds ?? []).map(id => String(id))))
    }

    return {
        userIds: users.map(u => u.id),
        userIdToRoleNames,
        userIdToOrbatRoleIds,
        orbatRoleIdToDoc,
        roleNameToDoc,
        overrideUserIds,
        userIdToDepartments,
        userIdToDepartmentRoleIds,
        departmentRoleIdToDoc,
        departmentBaseRoleIdByDept,
    }
}

function resolveGrant(state: ResolvedState, userId: string, key: string): PermissionGrant {
    const roleNames = state.userIdToRoleNames.get(userId) ?? new Set<string>()
    const viaGlobalOverride = roleNames.has('J4-Administration') || state.overrideUserIds.has(userId)

    const qualifyingNames = PERMISSION_CATALOG[key] ?? []
    const viaDiscordRoles = qualifyingNames.filter(name => roleNames.has(name))

    const orbatRoleIds = state.userIdToOrbatRoleIds.get(userId) ?? new Set<string>()
    const viaOrbatRoles: string[] = []
    for (const orbatRoleId of orbatRoleIds) {
        const doc = state.orbatRoleIdToDoc.get(orbatRoleId)
        if (doc?.permissions.includes(key)) viaOrbatRoles.push(doc.name)
    }

    // Base-role grant: one per department this user is a member of. Sub-role
    // grant: every DepartmentRole id explicitly held, regardless of
    // department — mirrors hasDepartmentPermission()'s isBase-or-held-id OR.
    const viaDepartmentRoles: string[] = []
    for (const dept of state.userIdToDepartments.get(userId) ?? []) {
        const baseId = state.departmentBaseRoleIdByDept.get(dept)
        const doc = baseId ? state.departmentRoleIdToDoc.get(baseId) : undefined
        if (doc?.permissions.includes(key) && baseId) viaDepartmentRoles.push(baseId)
    }
    for (const roleId of state.userIdToDepartmentRoleIds.get(userId) ?? []) {
        const doc = state.departmentRoleIdToDoc.get(roleId)
        if (doc?.permissions.includes(key)) viaDepartmentRoles.push(roleId)
    }

    const granted = viaGlobalOverride || viaDiscordRoles.length > 0 || viaOrbatRoles.length > 0 || viaDepartmentRoles.length > 0

    return { granted, viaDiscordRoles, viaOrbatRoles, viaDepartmentRoles, viaGlobalOverride }
}

function categoryLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

export async function buildPermissionsTree(): Promise<PermissionCategory[]> {
    const state = await resolveState()

    const orbatRolesByKey = new Map<string, PermissionOrbatRole[]>()
    for (const [id, doc] of state.orbatRoleIdToDoc) {
        for (const key of doc.permissions) {
            const list = orbatRolesByKey.get(key) ?? []
            list.push({ id, name: doc.name })
            orbatRolesByKey.set(key, list)
        }
    }

    const departmentRolesByKey = new Map<string, PermissionDepartmentRole[]>()
    for (const [id, doc] of state.departmentRoleIdToDoc) {
        for (const key of doc.permissions) {
            const list = departmentRolesByKey.get(key) ?? []
            list.push({ id, department: doc.department, name: doc.name })
            departmentRolesByKey.set(key, list)
        }
    }

    const categoriesMap = new Map<string, PermissionNodeStatic[]>()
    for (const key of PERMISSION_KEYS) {
        const categoryKey = key.split('.')[0]
        const qualifyingNames = PERMISSION_CATALOG[key] ?? []

        const discordRoles: PermissionDiscordRole[] = qualifyingNames.map(name => {
            const doc = state.roleNameToDoc.get(name)
            return doc
                ? { id: doc.id, name: doc.name, color: doc.color, resolved: true }
                : { id: name, name, color: 0, resolved: false }
        })

        let memberCount = 0
        for (const userId of state.userIds) {
            if (resolveGrant(state, userId, key).granted) memberCount++
        }

        const node: PermissionNodeStatic = {
            key,
            discordRoles,
            orbatRoles: orbatRolesByKey.get(key) ?? [],
            departmentRoles: departmentRolesByKey.get(key) ?? [],
            memberCount,
        }

        const list = categoriesMap.get(categoryKey) ?? []
        list.push(node)
        categoriesMap.set(categoryKey, list)
    }

    return [...categoriesMap.entries()].map(([key, permissions]) => ({
        key,
        label: categoryLabel(key),
        permissions,
    }))
}

export async function buildMemberGrants(userId: string): Promise<Record<string, PermissionGrant> | null> {
    const exists = await Db.users.findOne(
        { id: userId, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
        { projection: { id: 1 } }
    )
    if (!exists) return null

    const state = await resolveState()
    const grants: Record<string, PermissionGrant> = {}
    for (const key of PERMISSION_KEYS) {
        grants[key] = resolveGrant(state, userId, key)
    }
    return grants
}

/**
 * Every active (non-discharged, non-skeleton) user ID that is granted `key`,
 * resolved through the same additive logic as hasPermission()/the permissions
 * tree — Discord roles, ORBAT Role grants, and global overrides.
 */
export async function getGrantedUserIds(key: string): Promise<string[]> {
    const state = await resolveState()
    return state.userIds.filter(userId => resolveGrant(state, userId, key).granted)
}
