import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog'

/**
 * Additive permission check: true if the user's Discord roles satisfy the
 * existing PERMISSIONS entry for this key, OR their currently assigned
 * ORBAT position's Role explicitly grants this key. This only ever widens
 * access relative to the existing PERMISSIONS check — never narrows it, so
 * it's safe to introduce without touching any existing gate.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const discordRoleNames = PERMISSION_CATALOG[key]
    if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true

    const position = await Db.orbatPositions.findOne({ userId: user.id })
    if (!position?.roleId) return false

    const role = await Db.orbatRoles.findOne({ _id: position.roleId })
    return !!role?.permissions.includes(key)
}
