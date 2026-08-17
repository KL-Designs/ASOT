import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { generateMilpacForUser } from '@/lib/milpac-gen/generate-for-user'
import { resolveMilpacProfile } from './milpac-profile'
import { deriveStatus, platoonLabel } from './milpac-status'
import { readCoverImage } from './milpac-cover'
import { toCardImage } from './card-images'
import { loadConfirmedOps, resolvePromotionPoints, resolveEnlistedDate, durationSince, getPromotionProgress } from './milpac-stats'
import { canonicalSegment, buildSlugIndex, toSlugCandidate } from './milpac-slug'
import { MILPAC_TABS, tabPath, shareLabelFor } from './milpac-tabs'
import { pickCardKit } from '@/lib/loadout/select'
import { formatKitLine } from '@/lib/loadout/kit-line'
import { parseLoadout } from '@/lib/loadout/parse'
import { summariseLoadout } from '@/lib/loadout/summary'

/**
 * Everything the Discord dossier card draws, for one member.
 *
 * Separate from the component so the card is a pure function of data — satori
 * cannot await, and a component that queried Mongo mid-render would be
 * untestable and unreadable at once.
 *
 * Deliberately not the OpenGraph share card's data. That card is the link
 * preview for every milpac URL pasted anywhere; growing it into this would
 * change all of them (spec §1).
 */

export const DOSSIER_SIZE = { width: 1400, height: 860 }

/** The draw boxes, matched to the sources' aspect ratios — see toCardImage. */
const UNIFORM_BOX = { width: 560, height: 400 }
const MEDALS_BOX  = { width: 700, height: 250 }

export type DossierLink = { label: string; path: string; emoji: string }
export type DossierStat = { value: string; label: string; accent: boolean }

export type DossierProgress = {
    /** The rank held now. */
    from: string
    /** The rank being worked toward, or null at the top of a track. */
    to: string | null
    /** `280 / 451 pts`, or why there is no bar. */
    caption: string
    /** Percent through the current tier, or null when there is nothing to fill. */
    pct: number | null
}

export type DossierData = {
    accent: string
    name: string
    fullRank: string
    /** `1 PL · 2 SECT · Rifleman`, with absent segments dropped. */
    meta: string
    statusLabel: string
    discharged: boolean
    cover: string | null
    uniform: string | null
    medals: string | null
    stats: DossierStat[]
    progress: DossierProgress | null
    kitLine: string | null
    links: DossierLink[]
}

export async function buildDossierData(member: User, allMembers: User[]): Promise<DossierData> {
    const orbatEntry = await getOrbatEntryByUserId(member.id)
    const { accent, name, fullRank } = resolveMilpacProfile(member, orbatEntry)
    const status = deriveStatus(Boolean(member.discharged), orbatEntry?.category)

    const confirmedOps = await loadConfirmedOps(member.id)
    const awards = member.milpac?.awards ?? []
    const quals  = member.milpac?.qualifications ?? []

    // A private kit is the member's own business, and this reply can land in a
    // public channel — so the filter is on the query, not on the result.
    const publicKits = await Db.loadouts
        .find({ userId: member.id, shared: true })
        .sort({ updatedAt: -1 })
        .toArray()
    const kit = pickCardKit(publicKits)

    /**
     * The render service is allowed to be down. Identity, statistics and the
     * kit line still make a good card, so the artwork is optional rather than
     * load-bearing (spec §7) — unlike `type=uniform`, which has nothing left to
     * return without it.
     */
    const artwork = await generateMilpacForUser(member).catch(err => {
        console.error('[milpac] dossier artwork unavailable for', member.username, err)
        return null
    })

    const [cover, uniform, medals] = await Promise.all([
        readCoverImage(member.id, DOSSIER_SIZE),
        toCardImage(artwork?.uniform, UNIFORM_BOX),
        toCardImage(artwork?.medals, MEDALS_BOX),
    ])

    const segment = canonicalSegment(member, buildSlugIndex(allMembers.map(toSlugCandidate)))
    const base = `/milpacs/${encodeURIComponent(segment)}`

    const points = resolvePromotionPoints(member, confirmedOps)

    // The three states the page's bar has, resolved to one shape so the card
    // draws rather than decides. A billet rank has a next rank but no points
    // threshold, so it gets a caption and no bar rather than an empty one.
    const rankAbbr = member.milpac?.currentRank
    const raw = getPromotionProgress(rankAbbr, points)
    const progress: DossierProgress | null =
        !raw || !rankAbbr ? null
        : raw.atMax ? { from: rankAbbr, to: null, caption: 'Top of rank track', pct: null }
        : raw.billetOnly ? { from: rankAbbr, to: raw.nextRank, caption: 'Billet appointment', pct: null }
        : { from: rankAbbr, to: raw.nextRank, caption: `${raw.current} / ${raw.required} pts`, pct: raw.pct }

    return {
        accent,
        name,
        fullRank: fullRank || 'Serving member',
        meta: [platoonLabel(orbatEntry?.category), orbatEntry?.section, orbatEntry?.role]
            .filter(Boolean).join('  ·  '),
        statusLabel: status.label,
        discharged: status.key === 'discharged',
        cover,
        uniform,
        medals,
        stats: [
            { value: String(confirmedOps.length),                  label: 'Operations', accent: true },
            { value: durationSince(resolveEnlistedDate(member)) ?? '—', label: 'Service', accent: true },
            { value: String(awards.length),                        label: 'Awards', accent: false },
            { value: String(quals.length),                         label: 'Qualifications', accent: false },
            { value: String(points), label: 'Points', accent: false },
        ],
        progress,
        kitLine: kit ? formatKitLine(kit.name, summariseLoadout(parseLoadout(kit.raw))) : null,
        // The buttons are the site's own sections, so a fourth tab added to
        // milpac-tabs produces a fourth button with no bot change. Kits is
        // dropped when there is nothing public to show — the same predicate the
        // kit line uses, so there is one notion of "has kits worth showing".
        links: MILPAC_TABS
            .filter(tab => tab.key !== 'kits' || kit !== null)
            .map(tab => ({ label: shareLabelFor(tab), path: `${base}${tabPath(tab.key)}`, emoji: tab.emoji })),
    }
}
