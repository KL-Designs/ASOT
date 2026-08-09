import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog'

/**
 * Additive permission check: true if the user's Discord roles satisfy the
 * existing PERMISSIONS entry for this key, OR ANY of the ORBAT positions
 * they currently hold has a Role that explicitly grants this key (a user
 * can hold more than one position). This only ever widens access relative
 * to the existing PERMISSIONS check — never narrows it, so it's safe to
 * introduce without touching any existing gate.
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
    if (roleIds.length === 0) return false

    const roles = await Db.orbatRoles.find({ _id: { $in: roleIds } }).toArray()
    return roles.some(role => role.permissions.includes(key))
}
