import Db from '@/lib/mongo'

/**
 * Putting a returning member's record back.
 *
 * When somebody is discharged, their milpac is copied into a snapshot
 * (`Db.dischargeSnapshots`). When they come back, parts of it can be restored
 * rather than re-earned. Which parts is a decision, not a default — a member
 * away for three years may keep their awards but be asked to redo their
 * trainings — so it is always an explicit list.
 *
 * Two paths end here and must restore identically: J4's own Reinstate action,
 * and a recruiter's proposal on a returning member's recruit record, applied
 * when the J1 lead signs the recruit off.
 */

export { RESTORE_ITEMS, RESTORE_LABEL, sanitiseRestoreItems, type RestoreItem } from './reinstate-items'
import type { RestoreItem } from './reinstate-items'

/**
 * The `$set` that restores the chosen items from a snapshot's milpac. Pure —
 * the part worth testing, since a wrong path here silently restores nothing.
 *
 * An item with nothing in the snapshot is skipped rather than written as
 * empty: restoring must never *remove* something the member has earned since.
 */
export function restoreOperations(
    milpac: Partial<NonNullable<User['milpac']>> | undefined,
    items: readonly RestoreItem[],
): Record<string, unknown> {
    const set: Record<string, unknown> = {}
    if (!milpac) return set

    if (items.includes('qualifications') && milpac.qualifications?.length) {
        set['milpac.qualifications'] = milpac.qualifications
    }
    if (items.includes('awards') && milpac.awards?.length) {
        set['milpac.awards'] = milpac.awards
    }
    if (items.includes('trainings') && milpac.billetCounts) {
        const bc = milpac.billetCounts
        set['milpac.billetCounts.platoonTraining'] = bc.platoonTraining ?? 0
        set['milpac.billetCounts.sectionTraining'] = bc.sectionTraining ?? 0
        set['milpac.billetCounts.j3Bct12'] = bc.j3Bct12 ?? 0
        set['milpac.billetCounts.j3OtherTrainings'] = bc.j3OtherTrainings ?? 0
    }
    if (items.includes('operations')) {
        if (milpac.operations?.length) set['milpac.operations'] = milpac.operations
        if (milpac.billetCounts?.campaignMedals) set['milpac.billetCounts.campaignMedals'] = milpac.billetCounts.campaignMedals
    }
    return set
}

/**
 * Restore the chosen items onto the member from their discharge snapshot.
 * Returns the items that actually had something to restore. Does not touch
 * `discharged` — whether the member is reinstated is the caller's decision.
 */
export async function restoreFromSnapshot(discordId: string, items: readonly RestoreItem[]): Promise<RestoreItem[]> {
    if (items.length === 0) return []

    // The most recent snapshot: somebody discharged twice has two.
    const snapshot = await Db.dischargeSnapshots.findOne({ discordId }, { sort: { createdAt: -1 } })
    if (!snapshot) return []

    const set = restoreOperations(snapshot.milpac, items)
    if (Object.keys(set).length === 0) return []

    await Db.users.updateOne({ id: discordId }, { $set: set })

    return items.filter(item =>
        item === 'trainings' ? 'milpac.billetCounts.j3Bct12' in set
            : item === 'operations' ? ('milpac.operations' in set || 'milpac.billetCounts.campaignMedals' in set)
                : `milpac.${item}` in set)
}
