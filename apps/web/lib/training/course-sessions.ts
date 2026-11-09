import { nextWeekday } from './session-dates'

/**
 * Selection and the Reinforcement Cycle are scheduled as a run of numbered
 * sessions, each with its own date and time (row 213 follow-up). The session
 * names and runtimes come from the course in the Training Hub, which starts
 * from the defaults here; J3 can rename or remove sessions per run (catch-ups
 * are only added as required).
 *
 * Pure: shared by the Add Training Event dialog, the Training Hub's launch
 * dialog and the course-instances route.
 */

export type CourseKind = 'selection' | 'reinforcement_cycle'

export interface SessionTemplateItem {
    name: string
    /** Runtime in minutes; the course's own duration when unset. */
    durationMinutes?: number
}

export const MAX_SESSIONS = 20

const rc = (name: string, count: number): SessionTemplateItem[] => Array.from({ length: count }, () => ({ name }))

export const DEFAULT_SESSION_TEMPLATES: Record<CourseKind, SessionTemplateItem[]> = {
    selection: rc('', 4),
    reinforcement_cycle: [
        ...rc('Foundation Skills', 2),
        ...rc('CQB', 4),
        ...rc('Small Unit Tactics', 2),
        ...rc('Mobility Operations', 1),
        ...rc('Advanced Assault Skills', 2),
        ...rc('Parachute School & Military Freefall', 1),
        ...rc('Consolidation', 1),
        ...rc('Final Week', 1),
    ],
}

export function sessionTemplateFor(type: { courseType?: string | null; sessionTemplate?: SessionTemplateItem[] | null }): SessionTemplateItem[] {
    if (type.sessionTemplate?.length) return type.sessionTemplate.map(s => ({ ...s }))
    const kind = type.courseType === 'reinforcement_cycle' ? 'reinforcement_cycle' : 'selection'
    return DEFAULT_SESSION_TEMPLATES[kind].map(s => ({ ...s }))
}

/** "Session 3 — CQB", or just "Session 3" with no name. */
export function sessionTitle(n: number, name?: string | null): string {
    const clean = (name ?? '').trim()
    return clean ? `Session ${n} — ${clean}` : `Session ${n}`
}

function cleanDuration(v: unknown): number | undefined {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) && n >= 15 && n <= 24 * 60 ? n : undefined
}

/** A template as the client sent it, or null when it is not one. */
export function sanitiseSessionTemplate(input: unknown): SessionTemplateItem[] | null {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SESSIONS) return null
    return input.map(raw => {
        const r = (raw ?? {}) as Record<string, unknown>
        const durationMinutes = cleanDuration(r.durationMinutes)
        return { name: typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '', ...(durationMinutes ? { durationMinutes } : {}) }
    })
}

/**
 * Suggested dates after Session 1: the unit's Wednesday and Saturday nights in
 * turn, as the six-session calculation always did. Only a starting point; each
 * date can be changed before anything is created.
 */
export function suggestedSessionDates(session1: Date, count: number): Date[] {
    const out: Date[] = []
    if (count <= 0) return out
    const first = new Date(session1)
    out.push(first)
    let prev = first
    for (let i = 1; i < count; i++) {
        const day = new Date(prev)
        day.setHours(0, 0, 0, 0)
        // Saturday follows a weeknight, Wednesday follows a Saturday.
        const next = nextWeekday(day, prev.getDay() === 6 ? 3 : 6)
        next.setHours(first.getHours(), first.getMinutes(), 0, 0)
        out.push(next)
        prev = next
    }
    return out
}

export interface PlannedSession {
    name: string
    start: Date
    durationMinutes?: number
}

/** The sessions to create, as the client sent them: in date order, at least one. */
export function sanitiseSessionPlan(input: unknown): PlannedSession[] | null {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SESSIONS) return null
    const out: PlannedSession[] = []
    for (const raw of input) {
        const r = (raw ?? {}) as Record<string, unknown>
        const start = new Date(String(r.start ?? ''))
        if (isNaN(start.getTime())) return null
        const durationMinutes = cleanDuration(r.durationMinutes)
        out.push({ name: typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '', start, ...(durationMinutes ? { durationMinutes } : {}) })
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Which week of the course a session falls in, counting from Session 1's week. */
export function weekOf(session1: Date, date: Date): number {
    const a = new Date(session1); a.setHours(0, 0, 0, 0)
    const b = new Date(date); b.setHours(0, 0, 0, 0)
    return Math.max(1, Math.floor(Math.round((b.getTime() - a.getTime()) / 86_400_000) / 7) + 1)
}
