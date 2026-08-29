import type { RosterSlot } from '@/lib/attendance/roster'
import { stageIndex, type AttendanceStage } from '@/lib/operations/stage'

/**
 * @file The After Action Report — what happens once an operation has run.
 *
 * Three jobs share one surface, because they are one job as far as a member is
 * concerned: say what happened, say who was there, say how the night went.
 *
 * The authority model here is the unusual part. Everywhere else on the site,
 * who may do a thing is a permission somebody was granted. Here the person who
 * writes up a section is **whoever led it on the night**, which is a fact about
 * the roster rather than a fact about the member — a corporal filling in for an
 * absent sergeant runs the section and writes its AAR, and no permission was
 * granted for that. So `sectionLead()` is a query, not a check, and it is the
 * one piece of authority in the operations area that is positional.
 */

/* ── The window ─────────────────────────────────────────────────────────── */

/**
 * Is the AAR open?
 *
 * `confirmations_open` is exactly "the operation has finished" — it is the
 * stage the cron moves to when the night ends, and the one that sets the
 * operation's status to Completed. So the tab appears the moment the operation
 * is over, without needing a second notion of "finished" that could disagree
 * with the first.
 *
 * It stays open at `completed`. An AAR that closed when the paperwork did would
 * lose the people who write theirs up the next morning, which is most of them.
 */
export function aarOpen(stage: AttendanceStage | null | undefined): boolean {
    return stageIndex(stage ?? null) >= stageIndex('confirmations_open')
}

/* ── Who led what ───────────────────────────────────────────────────────── */

/**
 * The 1IC of a section: whoever was in its top filled slot on the night.
 *
 * Slots carry their `order` within a section, so the section's own hierarchy is
 * already recorded — the lowest order is its commander. Walking down to the
 * first *occupied* slot is what makes this match how a section actually works:
 * if the commander never showed, the 2IC ran it, and the write-up is theirs.
 *
 * Deliberately not the ORBAT's `isSenior` flag, which is who leads the section
 * on paper. The two disagree on exactly the nights this matters — a stand-in
 * commander is a normal Saturday, and asking the paper leader who was not there
 * to write up a section they did not lead is the wrong question.
 *
 * Returns null for a section nobody filled, which has nothing to report.
 */
export function sectionLead(roster: RosterSlot[], sectionTitle: string): string | null {
    const filled = roster
        .filter(slot => slot.sectionTitle === sectionTitle && slot.occupantUserId)
        .sort((a, b) => a.order - b.order)

    return filled[0]?.occupantUserId ?? null
}

/** Every section on the night, in roster order, deduplicated. */
export function sectionsOf(roster: RosterSlot[]): string[] {
    const seen = new Set<string>()
    return roster
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(slot => slot.sectionTitle)
        .filter(title => {
            if (!title || seen.has(title)) return false
            seen.add(title)
            return true
        })
}

/** The sections this member led. Usually none or one; never assumed to be one. */
export function ledSections(roster: RosterSlot[], userId: string | null): string[] {
    if (!userId) return []
    return sectionsOf(roster).filter(title => sectionLead(roster, title) === userId)
}

/**
 * May this member write up this section?
 *
 * Two ways in, and they are different in kind. `isLead` is positional — they
 * ran it. `canManageAll` is granted, and exists because somebody has to be able
 * to close an operation out when a 1IC never fills theirs in.
 */
export function canWriteSection(
    roster: RosterSlot[],
    userId: string | null,
    sectionTitle: string,
    canManageAll: boolean,
): boolean {
    if (canManageAll) return true
    if (!userId) return false
    return sectionLead(roster, sectionTitle) === userId
}

/* ── Who may say how it went ────────────────────────────────────────────── */

/**
 * Was this member on the operation?
 *
 * Feedback is only worth having from people who were there, so this gates it.
 *
 * Confirmation is the definitive answer, but it arrives late — a 1IC might
 * confirm the next day, and a member who wants to say something about the night
 * should not have to wait for their section commander to do paperwork first. So
 * an unconfirmed member who said they were coming *and* held a position counts
 * until somebody says otherwise, and an explicit non-attending status always
 * wins.
 */
export function didAttend(
    record: OperationAttendanceRecord | undefined,
    heldAPosition: boolean,
): boolean {
    if (!record) return false
    if (record.confirmed) return true
    // Somebody has already said they were not there. That is the answer.
    if (record.attendanceType && NON_ATTENDING.has(record.attendanceType)) return false
    if (record.attendanceType === 'ATTENDED') return true
    return record.rsvp === 'attending' && heldAPosition
}

/** Statuses that mean "was not on the operation". */
const NON_ATTENDING = new Set(['NOT ATTENDING', 'LOA', 'NO NOTICE', 'N/A'])

/* ── The statuses a 1IC can set ─────────────────────────────────────────── */

export interface AttendanceStatus {
    value: string
    label: string
    /** For the chip. Chosen against the dark board, not against paper. */
    colour: string
    /** Whether picking it counts the member as present. */
    present: boolean
}

/**
 * The eight statuses, moved here from `components/operations/AttendancePanel.tsx`
 * where they were a private constant.
 *
 * The AAR needs the same list, and two copies of "what states can a member be
 * in" is how the board and the write-up end up disagreeing about a night that
 * has already happened.
 */
export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
    { value: 'ATTENDED', label: 'Attended', colour: '#4caf50', present: true },
    { value: 'NOT ATTENDING', label: 'Not Attending', colour: 'rgba(219,0,29,0.9)', present: false },
    { value: 'RESOLVED', label: 'Resolved', colour: '#2196f3', present: false },
    { value: 'NO NOTICE', label: 'No Notice', colour: '#ff9800', present: false },
    { value: 'LOA', label: 'LOA', colour: '#9c27b0', present: false },
    { value: 'CONFIRM', label: 'Confirm', colour: '#00bcd4', present: true },
    { value: 'N/A', label: 'N/A', colour: 'rgba(237,237,237,0.35)', present: false },
    { value: 'ADDED TO UNIT', label: 'Added To Unit', colour: '#3f51b5', present: true },
]

export const ATTENDANCE_STATUS_VALUES = ATTENDANCE_STATUSES.map(s => s.value)

export function attendanceStatus(value: string | undefined): AttendanceStatus | null {
    return ATTENDANCE_STATUSES.find(s => s.value === value) ?? null
}

/* ── How the night went ─────────────────────────────────────────────────── */

export interface RatingStep {
    value: 1 | 2 | 3 | 4 | 5
    label: string
    /** How far from a normal night, for the diverging bar. -2 to +2. */
    offset: -2 | -1 | 0 | 1 | 2
}

/**
 * The scale, and why it is not stars.
 *
 * The question being asked is "how did this compare to a normal night", which
 * makes the middle the *neutral* point rather than a mediocre one. Stars cannot
 * say that: five stars reads as the goal and three reads as a disappointment,
 * so a run of perfectly good ordinary operations would score 3/5 and look like
 * a problem. The value is stored 1–5 because that is what it is, and drawn as a
 * diverging bar centred on "as usual" because that is what it means.
 */
export const RATING_SCALE: RatingStep[] = [
    { value: 1, label: 'Much worse', offset: -2 },
    { value: 2, label: 'Worse', offset: -1 },
    { value: 3, label: 'As usual', offset: 0 },
    { value: 4, label: 'Better', offset: 1 },
    { value: 5, label: 'Much better', offset: 2 },
]

export type RatingAspectKey = 'server' | 'combat' | 'story'

export interface RatingAspect {
    key: RatingAspectKey
    label: string
    /** What the member is actually being asked about. */
    hint: string
}

export const RATING_ASPECTS: RatingAspect[] = [
    {
        key: 'server',
        label: 'Server performance',
        hint: 'Desync, frame rate, crashes — how the server itself held up.',
    },
    {
        key: 'combat',
        label: 'Combat and action',
        hint: 'How engaging the fighting was, and how much of it there was.',
    },
    {
        key: 'story',
        label: 'Story and immersion',
        hint: 'Whether you could follow what was going on, and whether you enjoyed it.',
    },
]

/** A rating that is a whole number on the scale, or null. */
export function validRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/**
 * The average of a set of ratings, or null when nobody answered.
 *
 * Rounded to one decimal, because an average of "how was it compared to usual"
 * carries about that much signal and quoting 3.47 implies otherwise.
 */
export function averageRating(values: (number | null | undefined)[]): number | null {
    const given = values.filter((v): v is number => validRating(v))
    if (!given.length) return null
    return Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10
}
