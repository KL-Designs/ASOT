/**
 * The Mod Database — what the unit knows about each mod it has looked at.
 *
 * One entry per mod: what it is, where it lives, whether it is approved, in
 * testing, rejected or carries known issues, what those issues are, and who
 * tested it and when. Every member can read it; J2 and J7 keep it.
 *
 * Pure and import-free: the vocabulary, and the cleaning of what an editor
 * typed, tested without a database.
 */

export type ModStatus = 'approved' | 'testing' | 'known_issues' | 'rejected'

export const MOD_STATUSES: ModStatus[] = ['approved', 'testing', 'known_issues', 'rejected']

export const MOD_STATUS_LABEL: Record<ModStatus, string> = {
    approved: 'Approved',
    testing: 'Testing',
    known_issues: 'Known issues',
    rejected: 'Rejected',
}

/** For the status chip, chosen against the dark dashboard. */
export const MOD_STATUS_COLOUR: Record<ModStatus, string> = {
    approved: '#4caf50',
    testing: '#f59e0b',
    known_issues: '#ff9800',
    rejected: '#db001d',
}

export interface ModFields {
    name: string
    workshopUrl: string | null
    status: ModStatus
    notes: string
    testedByName: string
    /** `YYYY-MM-DD`, or '' when nobody has recorded a test. */
    testedOn: string
}

export const MOD_LIMITS = { name: 120, notes: 4000, testedByName: 80, url: 500 } as const

/** A web address, or nothing. A mod link is opened by every member who reads it. */
export function cleanModUrl(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const value = raw.trim()
    if (!value) return null
    return /^https?:\/\/[^\s]+$/i.test(value) ? value.slice(0, MOD_LIMITS.url) : null
}

/**
 * What an editor submitted, as fields that are safe to store.
 *
 * `partial` is for an edit, where a field that was not sent is left alone —
 * returned as undefined rather than defaulted, so a PATCH of only the status
 * cannot blank the notes.
 */
export function sanitiseMod(body: unknown, partial = false): { fields: Partial<ModFields>; error: string | null } {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const fields: Partial<ModFields> = {}

    if (input.name !== undefined || !partial) {
        const name = typeof input.name === 'string' ? input.name.trim().slice(0, MOD_LIMITS.name) : ''
        if (!name) return { fields, error: 'A mod needs a name.' }
        fields.name = name
    }

    if (input.workshopUrl !== undefined || !partial) {
        const given = typeof input.workshopUrl === 'string' ? input.workshopUrl.trim() : ''
        const url = cleanModUrl(given)
        if (given && !url) return { fields, error: 'The link has to be a web address.' }
        fields.workshopUrl = url
    }

    if (input.status !== undefined || !partial) {
        if (!MOD_STATUSES.includes(input.status as ModStatus)) {
            if (input.status !== undefined) return { fields, error: 'Unknown status.' }
            fields.status = 'testing'
        } else {
            fields.status = input.status as ModStatus
        }
    }

    if (input.notes !== undefined || !partial) {
        fields.notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, MOD_LIMITS.notes) : ''
    }
    if (input.testedByName !== undefined || !partial) {
        fields.testedByName = typeof input.testedByName === 'string' ? input.testedByName.trim().slice(0, MOD_LIMITS.testedByName) : ''
    }
    if (input.testedOn !== undefined || !partial) {
        const day = typeof input.testedOn === 'string' ? input.testedOn.trim() : ''
        if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { fields, error: 'The test date is not a date.' }
        fields.testedOn = day
    }

    return { fields, error: null }
}

/** The same link, whatever was trailing it — for spotting a mod already listed. */
export function normaliseModUrl(url: string | null | undefined): string {
    return (url ?? '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#&]+$/, '')
}

export function matchesModSearch(mod: Pick<ModFields, 'name' | 'notes' | 'testedByName'>, query: string): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [mod.name, mod.notes, mod.testedByName].some(v => v.toLowerCase().includes(q))
}
