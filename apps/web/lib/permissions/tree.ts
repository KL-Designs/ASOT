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

export interface PermissionNodeStatic {
    key: string
    discordRoles: PermissionDiscordRole[]
    orbatRoles: PermissionOrbatRole[]
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
    viaOrbatRole: string | null
    viaGlobalOverride: boolean
}

interface ResolvedState {
    userIds: string[]
    userIdToRoleNames: Map<string, Set<string>>
    userIdToOrbatRoleId: Map<string, string>
    orbatRoleIdToDoc: Map<string, { name: string; permissions: string[] }>
    roleNameToDoc: Map<string, { id: string; name: string; color: number }>
    overrideUserIds: Set<string>
}

// Shared by buildPermissionsTree() and buildMemberGrants() so both compute
// grants with identical logic to hasPermission() — additive: a global
// Discord-role bypass, OR a qualifying Discord role, OR an ORBAT position
// whose Role grants the key.
async function resolveState(): Promise<ResolvedState> {
    const [users, discordRoles, positions, orbatRoles] = await Promise.all([
        Db.users.find(
            { discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { id: 1, 'guild.roles': 1 } }
        ).toArray(),
        Db.roles.find({}).toArray(),
        Db.orbatPositions.find(
            { roleId: { $ne: null }, userId: { $ne: null } },
            { projection: { userId: 1, roleId: 1 } }
        ).toArray(),
        Db.orbatRoles.find({}, { projection: { name: 1, permissions: 1 } }).toArray(),
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

    const userIdToOrbatRoleId = new Map<string, string>()
    for (const pos of positions) {
        if (pos.userId && pos.roleId) userIdToOrbatRoleId.set(pos.userId, String(pos.roleId))
    }

    const overrideUserIds = new Set(
        (process.env.OVERRIDE?.split(',') ?? []).map(id => id.trim()).filter(Boolean)
    )

    return {
        userIds: users.map(u => u.id),
        userIdToRoleNames,
        userIdToOrbatRoleId,
        orbatRoleIdToDoc,
        roleNameToDoc,
        overrideUserIds,
    }
}

function resolveGrant(state: ResolvedState, userId: string, key: string): PermissionGrant {
    const roleNames = state.userIdToRoleNames.get(userId) ?? new Set<string>()
    const viaGlobalOverride = roleNames.has('J4-Administration') || state.overrideUserIds.has(userId)

    const qualifyingNames = PERMISSION_CATALOG[key] ?? []
    const viaDiscordRoles = qualifyingNames.filter(name => roleNames.has(name))

    const orbatRoleId = state.userIdToOrbatRoleId.get(userId)
    const orbatRoleDoc = orbatRoleId ? state.orbatRoleIdToDoc.get(orbatRoleId) : undefined
    const viaOrbatRole = orbatRoleDoc?.permissions.includes(key) ? orbatRoleDoc.name : null

    const granted = viaGlobalOverride || viaDiscordRoles.length > 0 || viaOrbatRole !== null

    return { granted, viaDiscordRoles, viaOrbatRole, viaGlobalOverride }
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
