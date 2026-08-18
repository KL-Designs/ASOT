/**
 * Resolving a name in the history CSV to a member.
 *
 * `client.buildOrbatLookup()` is deliberately not reused. It keys members by
 * `name || nickname || globalName` and lets a later member silently overwrite
 * an earlier one on a key collision — which is how "Bones" resolves to the
 * account that joined in 2026 rather than the one holding seven promotions.
 * For an ORBAT import that mis-seats someone until the next sync, that is
 * tolerable. For a one-way overwrite of a service record it is not.
 *
 * So this index collects every claimant per key, and a contested key resolves
 * to nobody unless an override says otherwise.
 */
import { RANKS_FLAT } from '@asot/lib'

export type MatchCandidate = {
    _id: string
    username: string
    name?: string
    globalName?: string
    /** `guild.nickname` — the caller flattens it. */
    nickname?: string
}

/**
 * The eleven names the index cannot settle, adjudicated by hand against
 * Discord join dates, stored history, ORBAT seating and the rank each record
 * ends on. See spec §5 for the evidence behind each one.
 *
 * This is an input, not a fallback: a contested name absent from this table is
 * skipped rather than guessed.
 */
export const MEMBER_OVERRIDES: Record<string, string> = {
    BobbittiHaxs: 'bobittihaxs',
    Gyphorim:     '.gryphorim.',
    Nutpriom:     'nutpirom',
    Sal:          'salpacino',
    Goose:        'mastergoose123',
    Odin:         'odinv9.',
    Enfield:      'tally.enfield',
    Bones:        'reality_bites',
    Wedgetail:    'falcon7589',
    Billy:        'farmingtons9',
    Formula:      'rjfrg',
}

const RANK_ABBRS = new Set(RANKS_FLAT.map(r => r.abbr.toLowerCase()))

/** Lowercased, with `[tags]` and `(parens)` removed. */
function normalise(value: string): string {
    return value.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
}

export function buildMemberIndex(members: MatchCandidate[]): Map<string, MatchCandidate[]> {
    const index = new Map<string, MatchCandidate[]>()

    const claim = (key: string, member: MatchCandidate) => {
        const held = index.get(key)
        if (held) {
            if (!held.includes(member)) held.push(member)
        } else {
            index.set(key, [member])
        }
    }

    for (const member of members) {
        for (const raw of [member.name, member.nickname, member.globalName, member.username]) {
            if (!raw) continue
            const key = normalise(raw)
            if (!key) continue
            claim(key, member)

            // "REC Dave" also claims "dave". Dave and Grubby have no `name`
            // and would not resolve at all without this.
            const space = key.indexOf(' ')
            if (space > 0 && RANK_ABBRS.has(key.slice(0, space))) {
                const bare = key.slice(space + 1).trim()
                if (bare) claim(bare, member)
            }
        }
    }
    return index
}

/** Empty when every override names a member that exists. */
export function validateOverrides(
    members: MatchCandidate[],
    overrides: Record<string, string> = MEMBER_OVERRIDES,
): string[] {
    const usernames = new Set(members.map(m => m.username))
    return Object.entries(overrides)
        .filter(([, username]) => !usernames.has(username))
        .map(([csvName, username]) => `override "${csvName}" names username "${username}", which does not exist`)
}

/**
 * CSV names to members.
 *
 * `errors` is fatal — the caller must abort rather than write. Both cases it
 * reports (a missing override target, two names landing on one member) merge
 * two people's service records, which is unrecoverable once the old arrays
 * have been replaced.
 *
 * `extraOverrides` lets a second import add adjudications of its own without
 * editing the history table above. The two files do not cover the same names:
 * the history CSV spans everyone who ever served, the ORBAT only who is
 * currently seated, so each surfaces contested names the other never sees.
 * Keeping them apart also keeps each table's evidence with the import that
 * gathered it.
 */
export function resolveMembers(
    csvNames: string[],
    members: MatchCandidate[],
    extraOverrides: Record<string, string> = {},
): {
    resolved: Map<string, MatchCandidate>
    unresolved: string[]
    errors: string[]
} {
    const overrides = { ...MEMBER_OVERRIDES, ...extraOverrides }
    const errors = validateOverrides(members, overrides)
    const byUsername = new Map(members.map(m => [m.username, m]))
    const index = buildMemberIndex(members)

    const resolved = new Map<string, MatchCandidate>()
    const unresolved: string[] = []

    for (const csvName of csvNames) {
        const override = overrides[csvName]
        if (override) {
            const member = byUsername.get(override)
            if (member) resolved.set(csvName, member)
            else unresolved.push(csvName)
            continue
        }

        const claimants = index.get(normalise(csvName)) ?? []
        if (claimants.length === 1) resolved.set(csvName, claimants[0])
        else unresolved.push(csvName)
    }

    const claimedBy = new Map<string, string[]>()
    for (const [csvName, member] of resolved) {
        const names = claimedBy.get(member._id) ?? []
        names.push(csvName)
        claimedBy.set(member._id, names)
    }
    for (const names of claimedBy.values()) {
        if (names.length > 1) errors.push(`CSV names ${names.map(n => `"${n}"`).join(' and ')} both resolve to one member`)
    }

    return { resolved, unresolved, errors }
}
