import Db from '../mongo'
import { RESERVIST_CATEGORY_IDS } from './constants'
import { syncOrbatDiscordRoles } from './discord'

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
                userId: targetUserId,
                sectionOrder: 0,
                positionOrder: count,
            } as OrbatPosition)
        }
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', 'activeReservist', ''),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    } else {
        // Section → section: remove old roles, add new roles
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        await Db.orbatPositions.updateOne({ _id: toPos!._id }, { $set: { userId: targetUserId } })
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', toPos!.category, toPos!.sectionTitle),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    }
}
