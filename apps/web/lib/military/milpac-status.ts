import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

/**
 * What the milpac profile's status pill and unit strapline are allowed to claim.
 *
 * Both are derived, not stored. There is no member-status field on the user
 * document, so the only signals that genuinely exist are the discharge
 * sub-document and the ORBAT position category — the latter being the sole place
 * the active-vs-inactive reservist distinction is recorded, and which
 * `getOrbatEntryByUserId()` used to discard by collapsing both categories into
 * the single label "Company Reservists".
 *
 * LOA and probationary are deliberately unsupported. LOA exists only per-event
 * (an attendance type, a meeting RSVP, a plain-text suffix on a Discord nickname
 * that is parsed only in order to strip it) and probationary does not exist at
 * all. A pill asserting either would state a fact the system does not hold, on a
 * page anyone on the internet can read.
 */

export type StatusKey = 'active' | 'reservistActive' | 'reservistInactive' | 'discharged'
export type MemberStatus = { key: StatusKey; label: string }

export function deriveStatus(discharged: boolean, orbatCategory?: string): MemberStatus {
    if (discharged) return { key: 'discharged', label: 'Discharged' }
    if (orbatCategory === 'activeReservist') return { key: 'reservistActive', label: 'Active Reservist' }
    if (orbatCategory === 'inactiveReservist') return { key: 'reservistInactive', label: 'Inactive Reservist' }
    return { key: 'active', label: 'Active' }
}

/**
 * The human platoon name for a position category, or null when the category sits
 * outside the platoon structure (reservists, or no ORBAT position at all) — the
 * strapline omits the segment rather than printing a placeholder.
 */
export function platoonLabel(category?: string): string | null {
    return PLATOON_CATEGORIES.find(p => p._id === category)?.label ?? null
}
