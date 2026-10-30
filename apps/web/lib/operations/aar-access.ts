import type { RosterSlot } from '@/lib/attendance/roster'
import { isHeadquartersSection } from '@/lib/military/bio-approval'
import { RATING_ASPECTS, averageRating, ledSections, platoonSections, sectionsOf, type RatingAspectKey } from './aar'

/**
 * Row 328: who sees what once an operation's AAR is in.
 *
 * `aar.ts` answers who may *write* a section up. This answers who may *read*
 * a section's Fix / Improve / Sustain, when the consolidated view opens, and
 * what it adds up to. Pure, so every rule here is tested.
 */

const CHQ_CATEGORY = 'companyHQ'

/** Was this member in company headquarters on the night? CHQ reads every section. */
export function inCompanyHq(roster: RosterSlot[], userId: string | null): boolean {
    if (!userId) return false
    return roster.some(slot => slot.occupantUserId === userId && slot.category === CHQ_CATEGORY)
}

export interface ViewerStanding {
    /** `aar.manage`: staff who close operations out. */
    canManageAll: boolean
    /** J4 Administration. */
    isJ4: boolean
    /** `Operation.ownedBy`. */
    isMissionMaker: boolean
}

/**
 * The sections whose raw points this member may read, in roster order.
 *
 * A section's own lead and its platoon's HQ see it; company HQ, J4, the
 * mission maker and `aar.manage` see every section. An ordinary member sees
 * none: their own write-up is theirs, but their section's is not.
 */
export function viewableSections(roster: RosterSlot[], userId: string | null, standing: ViewerStanding): string[] {
    const all = sectionsOf(roster)
    if (standing.canManageAll || standing.isJ4 || standing.isMissionMaker || inCompanyHq(roster, userId)) return all
    if (!userId) return []
    const mine = new Set([...ledSections(roster, userId), ...platoonSections(roster, userId)])
    return all.filter(title => mine.has(title))
}

/** Bypass the "write yours first" gate: J4 and the mission maker only. */
export function bypassesUnlock(standing: Pick<ViewerStanding, 'isJ4' | 'isMissionMaker'>): boolean {
    return standing.isJ4 || standing.isMissionMaker
}

/**
 * The consolidated Mission AAR and feedback view opens once the member has
 * saved their own report and, if they were on the operation, their feedback.
 * Someone who was not there has no feedback to give, so the report alone is enough.
 */
export function consolidatedUnlocked(input: {
    hasOwnAar: boolean
    attended: boolean
    hasFeedback: boolean
    bypass: boolean
}): boolean {
    if (input.bypass) return true
    if (!input.hasOwnAar) return false
    return !input.attended || input.hasFeedback
}

/** A saved AAR counts once any of its three boxes has something in it. */
export function aarHasContent(aar: { fix?: string; improve?: string; sustain?: string } | null | undefined): boolean {
    return !!aar && [aar.fix, aar.improve, aar.sustain].some(v => !!v?.trim())
}

export type FeedbackLike = Partial<Record<RatingAspectKey, number | null>> & { comment?: string }

export interface FeedbackSummary {
    responses: number
    averages: Record<RatingAspectKey, number | null>
    comments: string[]
}

export function summariseFeedback(rows: FeedbackLike[]): FeedbackSummary {
    const averages = Object.fromEntries(
        RATING_ASPECTS.map(a => [a.key, averageRating(rows.map(r => r[a.key]))]),
    ) as Record<RatingAspectKey, number | null>
    return {
        responses: rows.length,
        averages,
        comments: rows.map(r => r.comment?.trim() ?? '').filter(Boolean),
    }
}

/* ── The shared Mission AAR block ───────────────────────────────────────── */

export interface MissionAarInput {
    situation: string
    missingCaptured: string
    vehicles: { name: string; status: string; note: string }[]
}

export const VEHICLE_STATUSES = ['Operational', 'Damaged', 'Immobilised', 'Destroyed', 'Abandoned', 'Captured'] as const

export function sanitiseMissionAar(body: unknown): MissionAarInput | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
    const vehicles = (Array.isArray(b.vehicles) ? b.vehicles : [])
        .slice(0, 30)
        .map(v => {
            const o = (v ?? {}) as Record<string, unknown>
            return { name: str(o.name, 120).trim(), status: str(o.status, 40).trim(), note: str(o.note, 400) }
        })
        .filter(v => v.name)
    return { situation: str(b.situation, 8000), missingCaptured: str(b.missingCaptured, 4000), vehicles }
}

/**
 * Who may edit a section's shared block: whoever may write the section up
 * (lead, its platoon HQ, `aar.manage`), plus company HQ, J4 and the mission maker.
 */
export function canEditMissionAar(roster: RosterSlot[], userId: string | null, section: string, standing: ViewerStanding): boolean {
    if (standing.canManageAll || standing.isJ4 || standing.isMissionMaker || inCompanyHq(roster, userId)) return true
    if (!userId) return false
    return ledSections(roster, userId).includes(section) || platoonSections(roster, userId).includes(section)
}

/* ── Commendations ──────────────────────────────────────────────────────── */

/**
 * Who may write a commendation: anyone with a staff hand on the night
 * (a section lead, platoon or company HQ) and the staff overrides.
 */
export function canCommend(roster: RosterSlot[], userId: string | null, standing: ViewerStanding): boolean {
    if (standing.canManageAll || standing.isJ4 || standing.isMissionMaker) return true
    if (!userId) return false
    if (inCompanyHq(roster, userId)) return true
    if (ledSections(roster, userId).length) return true
    return roster.some(slot => slot.occupantUserId === userId && isHeadquartersSection(slot.sectionTitle))
}

/** The section a member played in on the night, or '' when they were off the roster. */
export function sectionOf(roster: RosterSlot[], userId: string): string {
    return roster.find(slot => slot.occupantUserId === userId)?.sectionTitle ?? ''
}
