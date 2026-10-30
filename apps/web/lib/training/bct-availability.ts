import Db from '@/lib/mongo'

/**
 * Clearing a recruit's BCT availability once they no longer need it.
 *
 * When J1 recruits somebody, the recruit's available times for basic training
 * go onto the J3 calendar as events flagged `isBCTAvailability`, so a trainer
 * can find a slot that suits them. Nothing ever took those entries off again:
 * a recruit who finished BCT 1 and 2 months ago still showed as available, and
 * the calendar filled with slots for people who were already trained.
 *
 * This runs wherever a qualification is awarded. Once a member holds both
 * BCT 1 and BCT 2, their remaining availability entries are removed.
 */

/** The qualification labels, as `lib/military/certifications.ts` spells them. */
export const BCT_QUALIFICATIONS = ['BCT 1', 'BCT 2'] as const

/** Whether a set of qualification labels includes both BCT courses. Pure, so
 *  the rule is testable without a database. */
export function hasCompletedBct(qualifications: readonly string[]): boolean {
    const held = new Set(qualifications.map(q => q.trim().toUpperCase()))
    return BCT_QUALIFICATIONS.every(q => held.has(q))
}

/**
 * Remove the member's BCT availability entries if they have finished both
 * courses. Returns how many were removed. Never throws: it is called after a
 * qualification has already been awarded, and a calendar hiccup must not turn
 * that into an error.
 *
 * Only entries that have not started yet are removed. Past ones are history —
 * they say when the recruit was available, which is still true.
 */
export async function clearBctAvailabilityIfDone(discordId: string): Promise<number> {
    try {
        const user = await Db.users.findOne({ id: discordId }, { projection: { 'milpac.qualifications': 1 } })
        const labels = (user?.milpac?.qualifications ?? []).map(q => q.qualification)
        if (!hasCompletedBct(labels)) return 0

        const result = await Db.calendarEvents.deleteMany({
            isBCTAvailability: true,
            applicantId: discordId,
            start: { $gte: new Date() },
        })
        return result.deletedCount
    } catch (err) {
        console.error('[training] BCT availability clean-up failed for', discordId, err)
        return 0
    }
}
