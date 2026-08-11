import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Batch variant of hasPermission: answers several permission keys in a single
 * query pass instead of repeating 2-3 uncached queries per key. Identical
 * semantics: the OVERRIDE env list is the only hard bypass, then ORBAT
 * position Roles, then the base department role plus assigned department
 * sub-roles. hasPermission stays the single-key entry point and is unchanged.
 *
 * Returns an entry for every requested key, false for keys not granted.
 */
export async function hasPermissions(user: User, keys: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}
    for (const key of keys) result[key] = false
    if (keys.length === 0) return result

    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) {
        for (const key of keys) result[key] = true
        return result
    }

    const granted = new Set<string>()

    const positions = await Db.orbatPositions
        .find({ userId: user.id, roleId: { $ne: null } }, { projection: { roleId: 1 } })
        .toArray()

    const roleIds = positions
        .map(p => p.roleId)
        .filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined)
    if (roleIds.length > 0) {
        const roles = await Db.orbatRoles.find({ _id: { $in: roleIds } }).toArray()
        for (const role of roles) for (const key of role.permissions) granted.add(key)
    }

    const deptCodes = user.departments ?? []
    // Re-materialize through this file's own ObjectId import; the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (deptCodes.length > 0 || subRoleIds.length > 0) {
        const deptRoles = await Db.departmentRoles.find({
            $or: [
                { department: { $in: deptCodes }, isBase: true },
                { _id: { $in: subRoleIds } },
            ],
        }).toArray()
        for (const role of deptRoles) for (const key of role.permissions) granted.add(key)
    }

    for (const key of keys) result[key] = granted.has(key)
    return result
}
