import { CERTIFICATIONS } from './certifications'
import { AWARDS } from './awards'

// ── Operation point values ────────────────────────────────────────────────────

export const OP_POINTS = {
    standardOp1st:    2,  // 1st standard op per week
    standardOp2nd:    1,  // 2nd standard op per week (max 3 total per weekend)
    ftxOp1st:         3,  // 1st FTX op per week
    ftxOp2nd:         2,  // 2nd FTX op per week (max 5 total per weekend)
    meeting:          1,  // J4/COY/Staff meeting
    sectionTraining:  1,  // max 1 per month
    platoonTraining:  1,  // max 1 per month
} as const

// ── Department action point values ────────────────────────────────────────────

export const DEPT_POINTS = {
    j1Per3Interviews:  1,  // 1pt per 3 interviews completed (floor division)
    j1InterviewBonus:  1,  // bonus interview point (direct count)
    j2PerMission:      2,  // per mission run
    j3Bct12:           1,  // BCT 1/2 training completed
    j3OtherTraining:   2,  // any training other than BCT 1/2
    j5ContentCreated:  1,  // per piece of content
    j5Per5Milpacs:     1,  // per 5 MILPAC tickets
    j5Per5PRPosts:     1,  // per 5 official public promotion posts
} as const

// ── Op points from confirmed attendance ───────────────────────────────────────

/**
 * Calculate operation points from a list of confirmed attendance records.
 * Grouping rule: per ISO week, 1 op = 2 pts, 2 or more ops = 3 pts (cap).
 */
export function calculateOpPoints(ops: { date?: Date | string | null; confirmedAt: Date | string | null }[]): number {
    function isoWeekKey(d: Date): string {
        const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
        utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
        const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
        const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
        return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
    }

    // Ops with a known date are grouped by ISO week (cap: 2pts first, 1pt second, max 3/week)
    // Ops without a date each get 2pts independently — we can't group them without a reference date
    const weekCounts = new Map<string, number>()
    let undatedPts = 0

    for (const op of ops) {
        if (op.date) {
            const key = isoWeekKey(new Date(op.date))
            weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
        } else {
            undatedPts += 2
        }
    }

    let total = undatedPts
    for (const count of weekCounts.values()) {
        total += count >= 2 ? 3 : 2
    }
    return total
}

// ── Input shape for point calculation ────────────────────────────────────────

export interface MilpacImportCounts {
    // Operations (raw counts from mastersheet)
    primaryNightOps:      number
    secondaryNightOps:    number
    primaryNightFTX:      number
    secondaryNightFTX:    number
    platoonTraining:      number
    sectionTraining:      number
    meetings:             number
    campaignMedals:       number  // counted as standard ops for point purposes

    // Department actions
    j1Interviews:         number
    j1InterviewBonus:     number
    j2MissionsRun:        number
    j3Bct12:              number
    j3OtherTrainings:     number
    j5ContentCreated:     number
    j5MilpacsGenerated:   number  // floor(count / 5) points
    j5OfficialPR:         number  // floor(count / 5) points

    // Awards and certifications (the actual entries, not counts)
    awards:         { name: string }[]
    qualifications: { qualification: string }[]

    // Manual adjustment from J4
    j4Points: number
}

// ── Point calculation ─────────────────────────────────────────────────────────

export function calculatePromotionPoints(counts: MilpacImportCounts): number {
    let total = 0

    // Operations
    total += counts.primaryNightOps    * OP_POINTS.standardOp1st
    total += counts.secondaryNightOps  * OP_POINTS.standardOp2nd
    total += counts.primaryNightFTX    * OP_POINTS.ftxOp1st
    total += counts.secondaryNightFTX  * OP_POINTS.ftxOp2nd
    total += counts.meetings           * OP_POINTS.meeting
    total += counts.sectionTraining    * OP_POINTS.sectionTraining
    total += counts.platoonTraining    * OP_POINTS.platoonTraining

    // Department actions
    total += Math.floor(counts.j1Interviews / 3) * DEPT_POINTS.j1Per3Interviews
    total += counts.j1InterviewBonus             * DEPT_POINTS.j1InterviewBonus
    total += counts.j2MissionsRun                * DEPT_POINTS.j2PerMission
    total += counts.j3Bct12                      * DEPT_POINTS.j3Bct12
    total += counts.j3OtherTrainings             * DEPT_POINTS.j3OtherTraining
    total += counts.j5ContentCreated             * DEPT_POINTS.j5ContentCreated
    total += Math.floor(counts.j5MilpacsGenerated / 5) * DEPT_POINTS.j5Per5Milpacs
    total += Math.floor(counts.j5OfficialPR      / 5) * DEPT_POINTS.j5Per5PRPosts

    // Awards — look up point value from AWARDS definition
    const awardPointMap = new Map<string, number>(AWARDS.map(a => [a.label, a.points]))
    for (const award of counts.awards) {
        total += awardPointMap.get(award.name) ?? 0
    }

    // Certifications — look up point value from CERTIFICATIONS definition
    const certPointMap = new Map<string, number>(CERTIFICATIONS.map(c => [c.label, c.points]))
    for (const qual of counts.qualifications) {
        total += certPointMap.get(qual.qualification) ?? 0
    }

    // Manual J4 adjustment (can be negative for discipline deductions)
    total += counts.j4Points

    return Math.max(0, total)
}
