/**
 * Objective suggestions — a shared pool of objective ideas for mission makers.
 *
 * Anybody can pitch an objective through a ticket (the "Objective Idea" option
 * on the Mission / Campaign ticket). A J2 lead confirms the good ones, and a
 * confirmed idea becomes an entry here: the J2 dashboard's Objective
 * Suggestions tab, where mission makers browse and tidy them, mirrored
 * read-only on the All Staff dashboard.
 *
 * The five fields are the ones the ticket asks for, and they ask a mission
 * maker the questions that make an objective work in play — not just what it
 * is, but how the players come to know about it and what it leads to next.
 *
 * Pure and import-free: the field list and the cleaning of what was typed.
 */

export interface ObjectiveFields {
    /** Objective type / name. */
    name: string
    /** Overview / concept. */
    overview: string
    /** How ASOT discovers or knows about it. */
    intel: string
    /** What the objective could link on to. */
    linkedIntel: string
    /** Anything else. */
    comments: string
}

export const OBJECTIVE_FIELDS: { key: keyof ObjectiveFields; label: string; hint: string; max: number; long: boolean }[] = [
    { key: 'name', label: 'Objective type / name', hint: 'What it is, in a few words.', max: 120, long: false },
    { key: 'overview', label: 'Overview / concept', hint: 'What happens, and what the players are asked to do.', max: 3000, long: true },
    { key: 'intel', label: 'Objective intelligence', hint: 'How ASOT discovers or knows about it.', max: 2000, long: true },
    { key: 'linkedIntel', label: 'Linked intelligence', hint: 'What this objective could link on to.', max: 2000, long: true },
    { key: 'comments', label: 'Other comments', hint: 'Anything else worth knowing.', max: 2000, long: true },
]

/**
 * What was submitted, as fields that are safe to store.
 *
 * `partial` is for an edit: a field that was not sent is left out rather than
 * blanked. A suggestion always needs a name and an overview — without those
 * there is nothing to browse.
 */
export function sanitiseObjective(body: unknown, partial = false): { fields: Partial<ObjectiveFields>; error: string | null } {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const fields: Partial<ObjectiveFields> = {}

    for (const { key, max } of OBJECTIVE_FIELDS) {
        if (input[key] === undefined && partial) continue
        fields[key] = typeof input[key] === 'string' ? (input[key] as string).trim().slice(0, max) : ''
    }

    if (fields.name !== undefined && !fields.name) return { fields, error: 'An objective needs a type or name.' }
    if (fields.overview !== undefined && !fields.overview) return { fields, error: 'An objective needs an overview.' }
    return { fields, error: null }
}

/** The fields of an Objective Idea ticket, as a suggestion. */
export function objectiveFromTicket(ticket: {
    title?: string
    description?: string
    objectiveIntel?: string
    objectiveLinkedIntel?: string
    objectiveComments?: string
}): ObjectiveFields {
    return sanitiseObjective({
        name: ticket.title,
        overview: ticket.description,
        intel: ticket.objectiveIntel,
        linkedIntel: ticket.objectiveLinkedIntel,
        comments: ticket.objectiveComments,
    }).fields as ObjectiveFields
}

export function matchesObjectiveSearch(o: ObjectiveFields, query: string): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return OBJECTIVE_FIELDS.some(f => o[f.key].toLowerCase().includes(q))
}
