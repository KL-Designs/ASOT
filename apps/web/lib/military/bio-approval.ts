/**
 * Who approves a change to a member's MILPAC biography.
 *
 * A biography is public — it is on the member's milpac and clipped onto their
 * roster card — so a change does not go live until somebody up the member's
 * chain of command has read it. "Up the chain" is resolved from the ORBAT:
 *
 *  1. the member's own platoon headquarters (PHQ);
 *  2. failing that, company headquarters (CHQ) — for a member who is *in*
 *     their PHQ, whose platoon has nobody in its PHQ, or who holds no position
 *     in a platoon at all (reservists, recruits);
 *  3. failing that, J4 — for a member of CHQ itself, or when CHQ is empty.
 *
 * J4 can always approve regardless of level; that is the route's business, not
 * this file's. A member never approves their own biography at any level.
 *
 * Pure and import-free so the resolution is tested without a database.
 */

export interface BioPosition {
    userId: string | null
    category: string
    sectionTitle: string
}

export type BioApprovalLevel = 'phq' | 'chq' | 'j4'

export interface BioApprovers {
    level: BioApprovalLevel
    /** Discord ids. Empty at level 'j4' — J4 is a role, resolved by the caller. */
    approverIds: string[]
}

export const BIO_MAX_LENGTH = 2000

const CHQ_CATEGORY = 'companyHQ'

/**
 * A platoon's headquarters section. Titles are free text set in the ORBAT
 * manager ("1-1 PHQ", "1-2 Platoon HQ"), so this matches on the word rather
 * than on an exact name.
 */
export function isHeadquartersSection(sectionTitle: string): boolean {
    return /\b(PHQ|HQ|headquarters)\b/i.test(sectionTitle)
}

export function bioApproversFor(memberId: string, positions: readonly BioPosition[]): BioApprovers {
    const own = positions.find(p => p.userId === memberId)
    const others = (list: readonly BioPosition[]) =>
        [...new Set(list.map(p => p.userId).filter((id): id is string => !!id && id !== memberId))]

    if (own && own.category !== CHQ_CATEGORY && !isHeadquartersSection(own.sectionTitle)) {
        const phq = others(positions.filter(p => p.category === own.category && isHeadquartersSection(p.sectionTitle)))
        if (phq.length) return { level: 'phq', approverIds: phq }
    }

    if (own?.category !== CHQ_CATEGORY) {
        const chq = others(positions.filter(p => p.category === CHQ_CATEGORY))
        if (chq.length) return { level: 'chq', approverIds: chq }
    }

    return { level: 'j4', approverIds: [] }
}

/** How the level reads in a sentence: "awaiting approval by …". */
export const BIO_LEVEL_LABEL: Record<BioApprovalLevel, string> = {
    phq: 'your platoon HQ',
    chq: 'company HQ',
    j4: 'J4',
}
