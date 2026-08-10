import Db from '../mongo'
import { RESERVIST_CATEGORY_IDS } from './constants'
import { syncOrbatDiscordRoles } from './discord'
import { ensureReservistRole } from './reservist-role'
import { swapRoleDiscordRoles, swapRoleTsGroups } from './role-sync'

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
        // FROM section → TO reservist: clear source, find/create activeReservist slot.
        // Resolve the destination roleId once — reuse a vacant slot's own roleId
        // (may be a real Role from a prior migration/backfill) if one exists,
        // otherwise fall back to the shared seeded "Reservist" role for a
        // brand-new position — and use that single value everywhere below so
        // the position's roleId field and the Discord/TS grant swaps agree.
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        const vacantSlot = await Db.orbatPositions.findOne({ category: 'activeReservist', userId: null })
        // Nullish-coalesce on .roleId specifically, not on vacantSlot itself —
        // a vacant slot can exist but still carry a stale roleId: null from
        // before reservists had a real role (pre-migration data), in which
        // case it needs the same backfill a brand-new position gets.
        const targetRoleId = vacantSlot?.roleId ?? await ensureReservistRole()
        if (vacantSlot) {
            // Also persist targetRoleId onto the slot itself (not just userId)
            // so a previously-null roleId gets backfilled here too — otherwise
            // this reservist's position keeps roleId: null in the DB even
            // though the Discord/TS grants below are applied correctly for
            // this transition, and future hasPermission() checks (which query
            // Db.orbatPositions for roleId: { $ne: null }) would silently skip them.
            await Db.orbatPositions.updateOne({ _id: vacantSlot._id }, { $set: { userId: targetUserId, roleId: targetRoleId } })
        } else {
            const count = await Db.orbatPositions.countDocuments({ category: 'activeReservist' })
            await Db.orbatPositions.insertOne({
                category: 'activeReservist',
                sectionTitle: '',
                role: 'Active Reservist',
                roleId: targetRoleId,
                userId: targetUserId,
                sectionOrder: 0,
                positionOrder: count,
            } as OrbatPosition)
        }
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', 'activeReservist', ''),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, targetRoleId),
            swapRoleTsGroups(targetUserId, fromPos.roleId, targetRoleId),
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
