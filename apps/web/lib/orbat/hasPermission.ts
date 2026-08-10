import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog'

/**
 * Additive permission check: true if the user's Discord roles satisfy the
 * existing PERMISSIONS entry for this key, OR any ORBAT position Role they
 * hold grants it, OR their base department role (implicit from
 * User.departments) or any assigned department sub-role grants it. Only
 * ever widens access relative to the existing PERMISSIONS check — never
 * narrows it, so it's safe to introduce without touching any existing gate.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const discordRoleNames = PERMISSION_CATALOG[key]
    if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true

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
    const subRoleIds = user.departmentRoleIds ?? []
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
