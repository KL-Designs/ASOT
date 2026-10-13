/**
 * Does a member have what a training requires before they can sign up to it?
 *
 * A training type lists its prerequisites by name — the names of other
 * trainings (`TrainingType.prerequisites`, chosen in the Training Hub from the
 * list of types). A member has met one when either:
 *
 *  - they hold a qualification of that name on their milpac, which is how
 *    everything earned before the site tracked attendance is recorded; or
 *  - they are marked as having attended a completed session of that training.
 *
 * Either is enough. Requiring the qualification alone would lock out a member
 * who sat the course last week and is waiting on J3 to award it; requiring
 * attendance alone would lock out everybody who qualified years ago.
 *
 * Pure and import-free so the rule is tested without a database.
 */

/** Names are compared loosely: a prerequisite typed "Basic Medical Course "
 *  must match a qualification stored as "basic medical course". */
const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export interface HeldTraining {
    /** `milpac.qualifications[].qualification` */
    qualifications: readonly string[]
    /** `trainingTypeName` of every completed session they were marked attended at. */
    attendedTrainings: readonly string[]
}

/**
 * The prerequisites still outstanding, in the order the training lists them
 * and spelt the way it lists them — this is what the member is shown.
 */
export function missingPrerequisites(required: readonly string[] | undefined, held: HeldTraining): string[] {
    if (!required?.length) return []
    const have = new Set([...held.qualifications, ...held.attendedTrainings].map(key))
    const seen = new Set<string>()
    return required
        .map(r => r.trim())
        .filter(r => {
            const k = key(r)
            // A blank or repeated entry in the list is not a second requirement.
            if (!k || seen.has(k)) return false
            seen.add(k)
            return !have.has(k)
        })
}

/** "A", "A and B", "A, B and C" — for the sentence the member reads. */
export function listNames(names: readonly string[]): string {
    if (names.length <= 1) return names.join('')
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
