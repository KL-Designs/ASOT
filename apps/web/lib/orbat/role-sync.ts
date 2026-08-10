import Db from '../mongo'
import { addGuildRole, removeGuildRole } from '../discord/bot'
import { applyTsServerGroups } from '../teamspeak/groups'

// Shared by every ORBAT mutation path that changes which OrbatRole a user
// holds (direct assign/unassign, ticket-approved moves, reservist add/remove,
// role-catalog changes) — extracted from lib/orbat/move.ts so all call sites
// apply Role-level Discord/TeamSpeak grants the same way instead of each
// reimplementing (or, historically, omitting) the swap.
//
// Pass `null` for "no prior Role" (fresh assignment) and `undefined` for
// "no destination Role" (pure revoke, e.g. full removal from the ORBAT).

export async function swapRoleDiscordRoles(userId: string, fromRoleId: OrbatPosition['roleId'], toRoleId: OrbatPosition['roleId'] | undefined) {
    const [fromRole, toRole] = await Promise.all([
        fromRoleId ? Db.orbatRoles.findOne({ _id: fromRoleId }) : Promise.resolve(null),
        toRoleId ? Db.orbatRoles.findOne({ _id: toRoleId }) : Promise.resolve(null),
    ])
    const revokeIds = fromRole?.discordRoleIds ?? []
    const grantIds = toRole?.discordRoleIds ?? []
    await Promise.allSettled([
        ...revokeIds.map(id => removeGuildRole(userId, id)),
        ...grantIds.map(id => addGuildRole(userId, id)),
    ])
}

export async function swapRoleTsGroups(userId: string, fromRoleId: OrbatPosition['roleId'], toRoleId: OrbatPosition['roleId'] | undefined) {
    const [fromRole, toRole] = await Promise.all([
        fromRoleId ? Db.orbatRoles.findOne({ _id: fromRoleId }) : Promise.resolve(null),
        toRoleId ? Db.orbatRoles.findOne({ _id: toRoleId }) : Promise.resolve(null),
    ])
    const revokeIds = fromRole?.tsGroupIds ?? []
    const grantIds = toRole?.tsGroupIds ?? []
    await Promise.allSettled([
        applyTsServerGroups(userId, 'remove', revokeIds),
        applyTsServerGroups(userId, 'add', grantIds),
    ])
}
