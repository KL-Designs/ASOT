import { SPACER, TS_GROUP_MAPPINGS, type TsCategory } from './tags'

/**
 * The TeamSpeak server groups a member is owed for what is on their MILPAC:
 * their rank, their awards, their campaign medals and their certifications.
 *
 * Departments and ORBAT positions already sync, because each of those carries
 * its TeamSpeak group id on its own record (`grant-bundles.ts`). A rank or a
 * medal has no record to carry one, so nothing ever synced them. This is the
 * missing half, and it resolves a group two ways:
 *
 *  1. **A link** — a row in `ts_group_links` saying "this campaign is that
 *     group". It is how a new campaign gets mapped, and it overrides (2).
 *  2. **By name** — the table in `tags.ts`, which already names the TeamSpeak
 *     group for every rank, award, certification and past campaign. The name
 *     is looked up in the server's live group list to get its id.
 *
 * ## What is taken away, and what is not
 *
 * Only **rank** groups are ever removed: a member holds one rank, so a rank
 * group that is not their current rank is wrong by definition. Awards,
 * campaign medals and certifications are **grant-only**. The site's record of
 * who earned what is not complete enough to be trusted as a reason to strip a
 * medal somebody is wearing on TeamSpeak, and a wrongly removed medal is a
 * worse mistake than a missing one.
 *
 * Pure and import-free beyond the name table, so all of it is tested without a
 * TeamSpeak connection.
 */

export type TsLinkKind = 'rank' | 'award' | 'campaign' | 'certification'

export const TS_LINK_KINDS: TsLinkKind[] = ['rank', 'award', 'campaign', 'certification']

export interface TsLink {
    kind: TsLinkKind
    /** Rank abbreviation, award label, campaign name or certification label. */
    key: string
    tsGroupId: number
}

export interface TsServerGroup {
    id: number
    name: string
}

/** One bundle of expected grants — the same shape `grant-bundles.ts` produces. */
export interface MilpacGrantBundle {
    discordRoleIds: string[]
    tsGroupIds: number[]
    source: string
}

const KIND_OF: Partial<Record<TsCategory, TsLinkKind>> = {
    rank: 'rank',
    award: 'award',
    operation: 'campaign',
    certification: 'certification',
}

const DEFAULT_SPACER: Record<TsLinkKind, string> = {
    rank: SPACER.RANK,
    award: SPACER.CITATIONS,
    campaign: SPACER.CAMPAIGN,
    certification: SPACER.CERTS,
}

/**
 * How a key is compared. Names are typed by hand on both sides — a campaign on
 * a MILPAC, a group on TeamSpeak — so case, doubled spaces and the "- " the
 * campaign groups are prefixed with must not be the difference between a
 * match and a miss.
 */
export function normaliseKey(value: string): string {
    return value.trim().replace(/^-\s*/, '').replace(/\s+/g, ' ').toLowerCase()
}

const slot = (kind: TsLinkKind, key: string) => `${kind}:${normaliseKey(key)}`

export interface MilpacResolver {
    /** Every group that stands for this thing, the preferred one first. */
    groupIds(kind: TsLinkKind, key: string): number[]
    /** The divider groups that must accompany it. */
    spacerIds(kind: TsLinkKind, key: string): number[]
    /** Whether it resolved through a link, by name, or not at all. */
    via(kind: TsLinkKind, key: string): 'link' | 'name' | null
    /** Every group that means "a rank" — the only ones ever removed. */
    rankGroupIds: Set<number>
}

export function buildResolver(groups: readonly TsServerGroup[], links: readonly TsLink[]): MilpacResolver {
    const idByName = new Map(groups.map(g => [normaliseKey(g.name), g.id]))
    const live = new Set(groups.map(g => g.id))

    const named = new Map<string, number[]>()
    const spacers = new Map<string, number[]>()
    const rankGroupIds = new Set<number>()

    for (const mapping of TS_GROUP_MAPPINGS) {
        const kind = KIND_OF[mapping.category]
        const key = mapping.rankAbbr ?? mapping.awardLabel ?? mapping.operationName ?? mapping.certLabel
        if (!kind || !key) continue

        const id = idByName.get(normaliseKey(mapping.tsName))
        if (id === undefined) continue

        const at = slot(kind, key)
        // Table order is kept: the plain variant of a rank is listed before
        // its (V) twin, and the first is the one granted to somebody who
        // holds neither.
        named.set(at, [...(named.get(at) ?? []), id])
        if (!spacers.has(at)) {
            spacers.set(at, mapping.spacers
                .map(name => idByName.get(normaliseKey(name)))
                .filter((v): v is number => v !== undefined))
        }
        if (kind === 'rank') rankGroupIds.add(id)
    }

    // A link to a group that no longer exists on the server is ignored rather
    // than granted: the grant would fail, and the name match may still work.
    const linked = new Map<string, number>()
    for (const link of links) {
        if (!live.has(link.tsGroupId)) continue
        linked.set(slot(link.kind, link.key), link.tsGroupId)
        if (link.kind === 'rank') rankGroupIds.add(link.tsGroupId)
    }

    return {
        groupIds(kind, key) {
            const at = slot(kind, key)
            const link = linked.get(at)
            return link !== undefined ? [link] : named.get(at) ?? []
        },
        spacerIds(kind, key) {
            const known = spacers.get(slot(kind, key))
            if (known) return known
            const fallback = idByName.get(normaliseKey(DEFAULT_SPACER[kind]))
            return fallback !== undefined ? [fallback] : []
        },
        via(kind, key) {
            const at = slot(kind, key)
            return linked.has(at) ? 'link' : named.has(at) ? 'name' : null
        },
        rankGroupIds,
    }
}

export interface MilpacSubject {
    rank?: string | null
    awards?: readonly string[]
    campaigns?: readonly string[]
    certifications?: readonly string[]
}

/** What the sync reads off a member's MILPAC. */
export function milpacSubject(milpac: {
    currentRank?: string
    awards?: { name: string }[]
    operations?: { name: string }[]
    qualifications?: { qualification: string }[]
} | undefined): MilpacSubject {
    return {
        rank: milpac?.currentRank ?? null,
        awards: (milpac?.awards ?? []).map(a => a.name).filter(Boolean),
        campaigns: (milpac?.operations ?? []).map(o => o.name).filter(Boolean),
        certifications: (milpac?.qualifications ?? []).map(q => q.qualification).filter(Boolean),
    }
}

const LABEL: Record<TsLinkKind, string> = {
    rank: 'Rank', award: 'Award', campaign: 'Campaign', certification: 'Certification',
}

/**
 * The bundles this MILPAC is owed.
 *
 * `held` is what the member has on TeamSpeak right now, and it matters for one
 * reason: several groups can stand for the same thing (a rank and its (V)
 * variant). Somebody already wearing one of them is in sync and keeps it; only
 * somebody wearing none is given the preferred one.
 */
export function milpacBundles(
    subject: MilpacSubject,
    resolver: MilpacResolver,
    held: ReadonlySet<number>,
): MilpacGrantBundle[] {
    const bundles: MilpacGrantBundle[] = []
    const seen = new Set<string>()

    const owe = (kind: TsLinkKind, key: string | null | undefined) => {
        if (!key) return
        const at = slot(kind, key)
        if (seen.has(at)) return
        seen.add(at)

        const candidates = resolver.groupIds(kind, key)
        if (!candidates.length) return
        const wearing = candidates.filter(id => held.has(id))
        bundles.push({
            discordRoleIds: [],
            tsGroupIds: [...(wearing.length ? wearing : [candidates[0]]), ...resolver.spacerIds(kind, key)],
            source: `${LABEL[kind]}: ${key}`,
        })
    }

    owe('rank', subject.rank)
    for (const award of subject.awards ?? []) owe('award', award)
    for (const campaign of subject.campaigns ?? []) owe('campaign', campaign)
    for (const cert of subject.certifications ?? []) owe('certification', cert)

    return bundles
}
