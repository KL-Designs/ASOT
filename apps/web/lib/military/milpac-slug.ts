import { resolveMilpacProfile } from '@/lib/military/milpac-profile'

/**
 * Name-based milpac URLs: `/milpacs/koda` rather than `/milpacs/itskodas`.
 *
 * A member's ASOT name is not an identifier — 37 name slugs are claimed by more
 * than one member on the live roster, 14 of them by two or more serving members.
 * So a name only becomes a URL when exactly one serving member claims it, and
 * every member keeps their Discord username as a permanent address regardless.
 * That username is what makes an already-shared link safe: names change with a
 * Discord nickname, usernames effectively do not.
 */

/** The minimum a member must expose to claim a name slug. */
export type SlugCandidate = {
    id: string
    username: string
    /** The ASOT name — `resolveMilpacProfile().name`, not the raw nickname. */
    name: string
    discharged: boolean
    skeleton: boolean
}

/**
 * The URL form of an ASOT name. Accents are folded rather than stripped, so
 * "Jörg" is `jorg` and not `jrg`; everything else non-alphanumeric collapses to
 * a single hyphen. Returns '' when nothing survives, which means "no claim".
 */
export function milpacSlug(name: string): string {
    return name
        .normalize('NFKD')
        // Combining marks left behind by NFKD — dropping these is what turns
        // the decomposed "o" + umlaut back into a plain "o".
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function toSlugCandidate(member: User): SlugCandidate {
    // orbatEntry only affects `callsign`, never `name`, so the lookup is skipped.
    return {
        id: member.id,
        username: member.username,
        name: resolveMilpacProfile(member, null).name ?? '',
        discharged: Boolean(member.discharged),
        skeleton: Boolean(member.isSkeletonAccount),
    }
}

/**
 * slug -> member id, for slugs claimed by exactly one serving member.
 *
 * Discharged and skeleton accounts never claim, which is what lets the sole
 * serving "Bones" hold `/milpacs/bones` while a discharged namesake exists.
 * The trade-off is that discharging that member retires the slug — acceptable
 * because their username URL keeps working and is what any old link used.
 */
export function buildSlugIndex(candidates: SlugCandidate[]): Map<string, string> {
    const claims = new Map<string, string[]>()

    for (const c of candidates) {
        if (c.discharged || c.skeleton) continue
        const slug = milpacSlug(c.name)
        if (!slug) continue
        const held = claims.get(slug)
        if (held) held.push(c.id)
        else claims.set(slug, [c.id])
    }

    const index = new Map<string, string>()
    for (const [slug, ids] of claims) {
        // Contested names resolve to nobody, on purpose. See the module comment.
        if (ids.length === 1) index.set(slug, ids[0])
    }
    return index
}

/**
 * The path segment a member's profile should be shared as: their name slug when
 * they hold one, otherwise their Discord username.
 */
export function canonicalSegment(member: User, index: Map<string, string>): string {
    const slug = milpacSlug(resolveMilpacProfile(member, null).name ?? '')
    return slug && index.get(slug) === member.id ? slug : member.username
}

/**
 * Resolve a `/milpacs/[username]` segment to a member, plus the segment it
 * should canonically be reached by.
 *
 * Username first: it is unique by construction and can never shadow another
 * member's name URL (verified against the live roster — no name slug equals a
 * different member's username). Name slug second.
 */
export function resolveSegment(segment: string, members: User[]): { member: User; canonical: string } | null {
    const byUsername = members.find(m => m.username === segment)
    const index = buildSlugIndex(members.map(toSlugCandidate))

    if (byUsername) return { member: byUsername, canonical: canonicalSegment(byUsername, index) }

    const claimantId = index.get(milpacSlug(segment))
    if (!claimantId) return null

    const member = members.find(m => m.id === claimantId)
    return member ? { member, canonical: canonicalSegment(member, index) } : null
}
