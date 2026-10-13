/**
 * Callsign galleries — a section's own corner of the gallery.
 *
 * A member can file a submission under their callsign, which is their ORBAT
 * section ("1-1 Alpha"). It is the same photograph in the same archive; the
 * callsign is one more facet on it, like its operation or its tags, and the
 * public gallery can be filtered down to one section's.
 *
 * Two rules live here, and both are answered from the ORBAT rather than from
 * anything the browser sends:
 *
 *  - **whose callsign** a member may file under — only the section they hold a
 *    position in. A member cannot post into another section's gallery.
 *  - **who may review** a callsign's submissions besides J5 — that section's
 *    staff, meaning whoever holds a senior position in it.
 *
 * Pure and import-free so both are tested without a database.
 */

export interface CallsignPosition {
    userId: string | null
    sectionTitle: string
    isSenior?: boolean
}

/**
 * The section this member belongs to, or null when they hold no position in
 * one (reservists and recruits carry no section title).
 */
export function callsignOf(positions: readonly CallsignPosition[], userId: string): string | null {
    const own = positions.find(p => p.userId === userId && p.sectionTitle?.trim())
    return own ? own.sectionTitle.trim() : null
}

/** The callsigns this member reviews as section staff. Usually none or one. */
export function staffedCallsigns(positions: readonly CallsignPosition[], userId: string): string[] {
    return [...new Set(
        positions
            .filter(p => p.userId === userId && p.isSenior && p.sectionTitle?.trim())
            .map(p => p.sectionTitle.trim()),
    )]
}

/** Everybody who reviews this callsign as section staff. */
export function callsignStaff(positions: readonly CallsignPosition[], callsign: string): string[] {
    return [...new Set(
        positions
            .filter(p => p.isSenior && p.userId && p.sectionTitle?.trim() === callsign)
            .map(p => p.userId as string),
    )]
}

export interface ReviewScope {
    /** Holds `gallery.review`: every submission. */
    all: boolean
    /** Section staff: only submissions filed under one of these. */
    callsigns: string[]
}

export function canReviewAnything(scope: ReviewScope): boolean {
    return scope.all || scope.callsigns.length > 0
}

/** May somebody with this scope act on a submission filed under `callsign`? */
export function canReviewCallsign(scope: ReviewScope, callsign: string | null | undefined): boolean {
    if (scope.all) return true
    return !!callsign && scope.callsigns.includes(callsign)
}
