import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Additive permission check: true if the user's Discord ID is in the
 * OVERRIDE env list (the only hard bypass), OR any ORBAT position Role
 * they hold grants it, OR their base department role (implicit from
 * User.departments) or any assigned department sub-role grants it.
 * Deliberately does NOT fall back to checking raw Discord role names —
 * that pattern is what this function replaces, one permission key at a
 * time, across the site. See docs/superpowers/specs/2026-08-11-permission-system-migration-phase1-design.md.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

    const positions = await Db.orbatPositions
        .find({ userId: user.id, roleId: { $ne: null } }, { projection: { roleId: 1 } })
        .toArray()

    const roleIds = positions
        .map(p => p.roleId)
        .filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined)
    if (roleIds.length > 0) {
        const roles = await Db.orbatRoles.find({ _id: { $in: roleIds } }).toArray()
        if (roles.some(role => role.permissions.includes(key))) return true
    }

    const deptCodes = user.departments ?? []
    // Re-materialize through this file's own ObjectId import — the shared
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
        if (deptRoles.some(role => role.permissions.includes(key))) return true
    }

    return false
}
