import Db from '../mongo'
import { RESERVIST_CATEGORY_IDS } from './constants'
import { syncOrbatDiscordRoles } from './discord'
import { addGuildRole, removeGuildRole } from '../discord/bot'
import { applyTsServerGroups } from '../teamspeak/groups'

async function swapRoleDiscordRoles(userId: string, fromRoleId: OrbatPosition['roleId'], toRoleId: OrbatPosition['roleId'] | undefined) {
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

async function swapRoleTsGroups(userId: string, fromRoleId: OrbatPosition['roleId'], toRoleId: OrbatPosition['roleId'] | undefined) {
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

/**
 * Applies an ORBAT position swap when a move request is approved.
 * Handles all three cases: reservist→section, section→reservist, section→section.
 */
export async function applyOrbatMove({
    fromPos,
    toPos,
    toIsReservist,
    targetUserId,
}: {
    fromPos: OrbatPosition
    toPos: OrbatPosition | null
    toIsReservist: boolean
    targetUserId: string
}) {
    if (RESERVIST_CATEGORY_IDS.includes(fromPos.category)) {
        // FROM reservist → TO section: clear reservist slot, assign destination
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        await Db.orbatPositions.updateOne({ _id: toPos!._id }, { $set: { userId: targetUserId } })
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', toPos!.category, toPos!.sectionTitle),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, toPos!.roleId),
            swapRoleTsGroups(targetUserId, fromPos.roleId, toPos!.roleId),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    } else if (toIsReservist) {
        // FROM section → TO reservist: clear source, find/create activeReservist slot
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        const vacantSlot = await Db.orbatPositions.findOne({ category: 'activeReservist', userId: null })
        if (vacantSlot) {
            await Db.orbatPositions.updateOne({ _id: vacantSlot._id }, { $set: { userId: targetUserId } })
        } else {
            const count = await Db.orbatPositions.countDocuments({ category: 'activeReservist' })
            await Db.orbatPositions.insertOne({
                category: 'activeReservist',
                sectionTitle: '',
                role: 'Active Reservist',
                roleId: null,
                userId: targetUserId,
                sectionOrder: 0,
                positionOrder: count,
            } as OrbatPosition)
        }
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', 'activeReservist', ''),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, null),
            swapRoleTsGroups(targetUserId, fromPos.roleId, null),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    } else {
        // Section → section: remove old roles, add new roles
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        await Db.orbatPositions.updateOne({ _id: toPos!._id }, { $set: { userId: targetUserId } })
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', toPos!.category, toPos!.sectionTitle),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, toPos!.roleId),
            swapRoleTsGroups(targetUserId, fromPos.roleId, toPos!.roleId),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    }
}
