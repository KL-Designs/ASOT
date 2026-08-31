/**
 * Auto-grouping a campaign's loose operations into numbered missions.
 *
 * Seven years of operations were created before campaign missions were
 * modelled, so they carry a `campaignId` and encode the mission in their title
 * instead — "Operation Lost Army IV — SUN". This is the parse that turns those
 * titles into real `CampaignMission` records.
 *
 * The parsing and grouping live here, apart from the route, for one specific
 * reason: a route file under Next's `typedRoutes` may export only route
 * handlers and the permitted config names. Exporting a helper from one compiles
 * under `tsc`, passes lint and passes vitest, and then fails `npm run build` —
 * which is how the per-campaign route ended up with the only copy of this logic
 * in the first place. Two routes now need it, so it lives in a module that is
 * allowed to export things.
 *
 * **No database import here, deliberately.** `lib/mongo.ts` throws at import
 * time when `MONGO_URI` is unset and opens a connection when it is, so a module
 * that touched it could not be unit-tested and could not be imported by a
 * client component. The Mongo half is `normalise-campaign-run.ts`.
 *
 * ── Relationship to `lib/operations/board.ts` ─────────────────────────────────
 *
 * `board.ts` has its own `detectDaySlot`/`detectRoman`, and the regexes are
 * currently character-for-character the same. They are kept apart on purpose:
 *
 *  - The board *infers* a grouping in order to draw the public archive. Nothing
 *    it decides is persisted, so it can afford to be generous — it already is,
 *    pairing ops that carry no Roman numeral at all under a "·" label.
 *  - This module decides what gets *written* to the database. An op stamped
 *    with the wrong `campaignMissionId` is a record a human has to unpick, and
 *    the route that uses it is idempotent only because it skips ops already
 *    stamped — it will not restamp a mistake away.
 *
 * Sharing one helper would make a loosening tweak made for the archive's
 * rendering into a silent change in what the J2 console writes. If you change a
 * pattern in either file, look at the other and decide consciously.
 */

/** The Roman numerals a mission suffix may use, in mission order. */
export const ROMAN_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Detect day slot from title (handles hyphen, en-dash, em-dash). */
export function detectDaySlot(title: string): { stripped: string; day: 'saturday' | 'sunday' | null } {
    const sat = title.match(/\s*[-–—]?\s*(sat|saturday)\s*$/i)
    if (sat) return { stripped: title.slice(0, title.length - sat[0].length).trim(), day: 'saturday' }
    const sun = title.match(/\s*[-–—]?\s*(sun|sunday)\s*$/i)
    if (sun) return { stripped: title.slice(0, title.length - sun[0].length).trim(), day: 'sunday' }
    return { stripped: title, day: null }
}

/** Detect Roman numeral suffix from title. */
export function detectRomanSuffix(title: string): { stripped: string; roman: string | null } {
    const m = title.match(/\s+(I{1,3}|IV|VI{0,3}|IX|X)\s*$/i)
    if (m) return { stripped: title.slice(0, title.length - m[0].length).trim(), roman: m[1].toUpperCase() }
    return { stripped: title, roman: null }
}

/** An operation reduced to what grouping needs. The caller maps `id` back. */
export interface NormalisableOp {
    id: string
    title: string
}

/** Why an operation could not be folded into a mission. */
export type SkipReason = 'no-roman-numeral'

/** One mission-to-be: the numeral, and the night or nights that fill it. */
export interface NormaliseGroup {
    /** The title with its day suffix stripped, lowercased. The grouping key. */
    key: string
    roman: string
    /** Index in `ROMAN_ORDER`, or 99 for a numeral past X, which sorts last. */
    romanIndex: number
    saturday: NormalisableOp | null
    sunday: NormalisableOp | null
    /** A mission that ran on one unpaired night — neither SAT nor SUN in the title. */
    standalone: NormalisableOp | null
}

export interface NormalisePlan {
    /** Groups in Roman-numeral order. Ties keep the order the ops arrived in. */
    groups: NormaliseGroup[]
    /**
     * Ops with no Roman numeral suffix. The route cannot guess a mission number
     * for these, so it leaves them alone — and the caller has to say so, because
     * "grouped 40" over a run that quietly ignored 6 reads as a clean sweep.
     */
    skipped: { op: NormalisableOp; reason: SkipReason }[]
}

/**
 * Work out which missions a campaign's loose operations should become.
 *
 * Pass the ops already filtered to one campaign and already sorted the way the
 * caller wants ties broken — the route sorts by date ascending, so when two ops
 * claim the same night of the same mission the later one wins the slot.
 */
export function planNormalise(ops: NormalisableOp[]): NormalisePlan {
    const groupMap = new Map<string, NormaliseGroup>()
    const skipped: { op: NormalisableOp; reason: SkipReason }[] = []

    for (const op of ops) {
        const { stripped: withoutDay, day } = detectDaySlot(op.title)
        const { roman } = detectRomanSuffix(withoutDay)
        if (!roman) {
            skipped.push({ op, reason: 'no-roman-numeral' })
            continue
        }

        // The key keeps the numeral — it is the title minus only the day suffix
        // — so "Lost Army IV — SAT" and "Lost Army IV — SUN" collide and
        // "Lost Army V — SAT" does not.
        const key = withoutDay.toLowerCase()
        let group = groupMap.get(key)
        if (!group) {
            const idx = ROMAN_ORDER.indexOf(roman)
            group = {
                key,
                roman,
                romanIndex: idx >= 0 ? idx : 99,
                saturday: null,
                sunday: null,
                standalone: null,
            }
            groupMap.set(key, group)
        }

        if (day === 'saturday') group.saturday = op
        else if (day === 'sunday') group.sunday = op
        else group.standalone = op
    }

    // Array.prototype.sort is stable, so same-numeral groups stay in the order
    // the ops established them — which, ops arriving date-sorted, is by date.
    const groups = [...groupMap.values()].sort((a, b) => a.romanIndex - b.romanIndex)

    return { groups, skipped }
}
