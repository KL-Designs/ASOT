/**
 * NCO assessments — a candidate being assessed on a mission night.
 *
 * The flow, in the order it happens:
 *
 *  1. The **candidate** requests an assessment on a mission night, at least a
 *     week ahead. A night that already has an approved assessment is taken.
 *  2. A **J3 lead** assigns an assessor. The **assessor** then marks
 *     themselves as assigned — the request is not settled until the person
 *     doing it has said they will.
 *  3. If the assessor needs to shadow the candidate's section, they ask that
 *     **section's staff**, who approve or decline.
 *  4. On the night, **CHQ** see on the attendance board that an assessment is
 *     running: who is being assessed, who is assessing, and whether they are
 *     shadowing.
 *  5. The assessor links the assessment sheet, records the outcome, and a
 *     recording can be linked afterwards.
 *
 * This file is the rules — who may do which step, and when — with no imports,
 * so every one is tested without a database. The route applies them.
 */

export type NcoAssessmentStatus = 'requested' | 'assigned' | 'confirmed' | 'completed' | 'cancelled'

export const NCO_STATUS_LABEL: Record<NcoAssessmentStatus, string> = {
    requested: 'Waiting for an assessor',
    assigned: 'Assessor to confirm',
    confirmed: 'Assessor confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
}

export type NcoOutcome = 'pass' | 'not_yet' | 'reassess'

export const NCO_OUTCOME_LABEL: Record<NcoOutcome, string> = {
    pass: 'Passed',
    not_yet: 'Not yet',
    reassess: 'To be reassessed',
}

/** How far ahead a night has to be to be requested. */
export const NCO_LEAD_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** Is this night far enough ahead to request an assessment on (rule 1)? */
export function farEnoughAhead(nightAt: Date | string, now: Date): boolean {
    return new Date(nightAt).getTime() - now.getTime() >= NCO_LEAD_DAYS * DAY_MS
}

/**
 * Does an assessment in this state hold its night?
 *
 * "Approved" in the brief means an assessor is on it: a bare request does not
 * block the night, because two candidates may both ask and J3 pick between
 * them. Once one has an assessor, the night is theirs.
 */
export function holdsNight(status: NcoAssessmentStatus): boolean {
    return status === 'assigned' || status === 'confirmed' || status === 'completed'
}

/** Still in play — not finished and not withdrawn. */
export function isActive(status: NcoAssessmentStatus): boolean {
    return status === 'requested' || status === 'assigned' || status === 'confirmed'
}

export interface NcoActor {
    id: string
    /** Holds `training.manage`. */
    isJ3Lead: boolean
    /** Section titles this person is staff of (senior positions). */
    staffOf: readonly string[]
    /** Holds a company headquarters position. */
    isChq: boolean
}

export interface NcoSubject {
    candidateId: string
    candidateSection?: string | null
    assessorId?: string | null
    status: NcoAssessmentStatus
    shadow?: { status: 'requested' | 'approved' | 'declined' } | null
}

export type NcoAction =
    | 'assign'          // J3 lead names an assessor
    | 'confirm'         // the assessor marks themselves as assigned
    | 'requestShadow'   // the assessor asks to shadow the section
    | 'decideShadow'    // section staff approve or decline
    | 'sheet'           // the assessor links the sheet, notes, outcome
    | 'recording'       // a recording link
    | 'complete'        // the assessor (or J3) closes it
    | 'cancel'          // the candidate withdraws, or J3 cancels

/** May this person take this step on this assessment, in its current state? */
export function canDo(action: NcoAction, actor: NcoActor, a: NcoSubject): boolean {
    const isAssessor = !!a.assessorId && a.assessorId === actor.id
    const isCandidate = a.candidateId === actor.id
    const active = isActive(a.status)

    switch (action) {
        case 'assign':
            // Re-assignable until the night is done: assessors drop out.
            return actor.isJ3Lead && active
        case 'confirm':
            return isAssessor && a.status === 'assigned'
        case 'requestShadow':
            // Only once they have said they are doing it, and only once.
            return isAssessor && a.status === 'confirmed' && !a.shadow
        case 'decideShadow':
            // The section being shadowed decides — not the assessor, and not
            // the candidate even if they are staff of their own section.
            return a.shadow?.status === 'requested' && !isCandidate && !isAssessor
                && !!a.candidateSection && actor.staffOf.includes(a.candidateSection)
        case 'sheet':
        case 'complete':
            return (isAssessor || actor.isJ3Lead) && (a.status === 'confirmed' || a.status === 'completed')
        case 'recording':
            // After the fact as well: the recording usually turns up later.
            return (isAssessor || actor.isJ3Lead || isCandidate) && (a.status === 'confirmed' || a.status === 'completed')
        case 'cancel':
            return (isCandidate || actor.isJ3Lead) && active
    }
}

/**
 * May this person see this assessment at all?
 *
 * The people in it, J3 leads, the staff of the section it concerns, and CHQ —
 * who need to know an assessment is running on the night (rule 4).
 */
export function canSee(actor: NcoActor, a: NcoSubject): boolean {
    return actor.isJ3Lead
        || actor.isChq
        || a.candidateId === actor.id
        || a.assessorId === actor.id
        || (!!a.candidateSection && actor.staffOf.includes(a.candidateSection))
}

/** A link somebody pasted: http(s) only, or nothing. */
export function cleanLink(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const value = raw.trim()
    if (!value) return null
    return /^https?:\/\/[^\s]+$/i.test(value) ? value.slice(0, 1000) : null
}
