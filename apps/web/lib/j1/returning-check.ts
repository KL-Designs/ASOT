import Db from '@/lib/mongo'
import { dischargeLevel, worseLevel, type ReturningLevel } from './rejoin'

/**
 * Everything the site knows about whether an applicant has been here before.
 *
 * Reads four records and reports the most cautious thing any of them says:
 * a previously rejected application, a discharge made on the site, the J4
 * master sheet's leaving history, and its denied-applications list.
 *
 * Lifted out of the applications route so the manual Recruit Member flow can
 * run the same check — it used to show only "this person was discharged" with
 * no outcome, which left the recruiter to go and find the history themselves.
 * The classification of a discharge lives in `rejoin.ts`.
 */
export async function runReturningMemberCheck(
    discordId: string,
): Promise<{ status: ReturningLevel; details: string }> {
    let worst: ReturningLevel = 'CLEAR'
    const reasons: string[] = []
    const elevate = (level: ReturningLevel) => { worst = worseLevel(worst, level) }

    // Previous rejected application → treat as to-be-reviewed
    const prevRejection = await Db.j1Applications.findOne({ discordId, status: 'rejected' })
    if (prevRejection) {
        const when = prevRejection.submittedAt
            ? new Date(prevRejection.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'unknown date'
        reasons.push(`Previously rejected application (${when})`)
        elevate('GD')
    }

    // Previously discharged member — the discharge type, unless J4 set a
    // rejoin status on it, which wins.
    const dischargedUser = await Db.users.findOne({ id: discordId, discharged: { $exists: true } }, { projection: { discharged: 1 } })
    if (dischargedUser?.discharged) {
        const discharge = dischargedUser.discharged
        const reason = discharge.reason ?? 'no reason on record'
        const level = dischargeLevel(discharge.type, discharge.rejoinStatus)
        const typeWord = dischargeLevel(discharge.type) === 'DD' ? 'Dishonourably discharged'
            : dischargeLevel(discharge.type) === 'HD' ? 'Honourably discharged'
                : 'Previously discharged (GD)'
        const set = discharge.rejoinStatus
            ? ` · J4 marked: ${level === 'HD' ? 'welcome back' : level === 'DD' ? 'not welcome' : 'to be reviewed'}`
            : ''
        reasons.push(`${typeWord} — ${reason}${set}`)
        elevate(level)
    }

    // J4 Master Sheet — Leaving History
    const leavingRecord = await Db.leavingHistory.findOne({ discordId })
    if (leavingRecord) {
        const ret = leavingRecord.return?.trim().toUpperCase()
        const type = (leavingRecord.type ?? '').trim().toUpperCase()
        const reason = leavingRecord.reason ?? ''
        const dateStr = leavingRecord.leavingDate ?? 'unknown date'
        if (ret === 'NO') {
            reasons.push(`Master Sheet: DO NOT RETURN — ${reason}`)
            elevate('DD')
        } else if (type === 'DD') {
            reasons.push(`Master Sheet: DD discharge (${dateStr}) — ${reason}`)
            elevate('DD')
        } else if (type === 'HD') {
            reasons.push(`Master Sheet: HD discharge (${dateStr}) — ${reason}`)
            elevate('HD')
        } else if (type === 'GD' || ret === 'REVIEW' || ret === 'INDEFINITE') {
            reasons.push(`Master Sheet: GD discharge (${dateStr}) — ${reason}`)
            elevate('GD')
        }
    }

    // J4 Master Sheet — Denied Applications HQ → to-be-reviewed
    const deniedRecord = await Db.deniedApplicationsHQ.findOne({ discordId })
    if (deniedRecord) {
        reasons.push(`Master Sheet: previously denied application (${deniedRecord.date}) — ${deniedRecord.reason}`)
        elevate('GD')
    }

    return {
        status: worst,
        details: worst === 'CLEAR' ? 'No prior record found' : reasons.join('; '),
    }
}
