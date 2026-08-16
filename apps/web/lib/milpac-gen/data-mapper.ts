import { createHash } from 'crypto'
import type { OrbatEntry } from '@/lib/orbat'
import {
    AWARD_TO_CITATION,
    QUAL_TO_BADGE,
    SECTION_TO_BADGE,
    DEFAULT_BADGE,
} from './maps'
import type { UniformData, BoxData, Citation, Medallion, TrainingBadge, Rank, Badge } from './types'

const MEDALLION_AWARDS = new Set([
    'Bronze Soldiers Medallion',
    'Silver Soldiers Medallion',
    'Gold Soldiers Medallion',
])

/**
 * Derive chest medallion variants (Bronze1/2/3, Silver1/2/3, Gold1/2/3) from the awards list.
 * Position suffix encodes horizontal slot: 1=left, 2=center, 3=right.
 * 1 medallion → center (2), 2 medallions → left+right (1,3), 3 medallions → all three slots.
 */
function deriveMedallions(awardNames: string[]): Medallion[] {
    const hasBronze = awardNames.includes('Bronze Soldiers Medallion')
    const hasSilver = awardNames.includes('Silver Soldiers Medallion')
    const hasGold   = awardNames.includes('Gold Soldiers Medallion')

    const tiers = (
        ['Bronze', 'Silver', 'Gold'] as const
    ).filter((_, i) => [hasBronze, hasSilver, hasGold][i])

    if (tiers.length === 0) return []
    if (tiers.length === 1) return [`${tiers[0]}2`] as Medallion[]
    if (tiers.length === 2) return [`${tiers[0]}1`, `${tiers[1]}3`] as Medallion[]
    return ['Bronze1', 'Silver2', 'Gold3']
}

// Non-P private-equivalent ranks — BCT 2 holders at these ranks show the PTE
// embellishment; every higher rank shows the gold PTEP one. Rank order within
// the private tier: base → L → P → S → SL.
//
// These are the abbreviations exactly as `lib/military/ranks.ts` writes them.
// They used to be listed in a parenthesis-stripped form to match asset
// filenames, which is no longer this app's concern — the renderer owns the
// mapping from rank to artwork, so nothing here rewrites a rank any more.
const PTE_BASIC_RANKS = new Set<string>([
    'PTE', 'PTE(L)',
    'SIG', 'SIG(L)',
    'TPR', 'TPR(L)',
    'SAP', 'SAP(L)',
    'GNR', 'GNR(L)',
    'LBDR', 'LBDR(L)', 'LBDR(J)',
    'BDR', 'BDR(L)', 'BDR(J)',
])

export function buildUniformData(user: User, orbatEntry: OrbatEntry | null): UniformData {
    // Sent verbatim. The render service resolves rank → artwork through its own
    // RANK_TO_ASSET table, which is the fix for apps/milpac/PLAN.md §3: the
    // greedy regexes that used to collapse every corps rank to a bare PTE and
    // then blank it are gone, and nothing replaced them here.
    const rank = user.milpac?.currentRank ?? ''
    const awardNames = user.milpac?.awards?.map(a => a.name) ?? []

    // Resolve display name from Discord nickname (strip rank prefix and tag decorations),
    // falling back to globalName or username. Mirrors milpac-profile.ts logic.
    const strippedNickname = user.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const rawDisplay = strippedNickname || user.globalName || user.username
    const parts = (strippedNickname || rawDisplay).split(' ')
    const parsedName = parts.length > 1 ? parts.slice(1).join(' ') : rawDisplay
    const resolvedDisplayName = user.name || parsedName

    const allCitations = awardNames
        .filter(n => !MEDALLION_AWARDS.has(n))
        .map(n => AWARD_TO_CITATION[n])
        .filter((c): c is Citation => Boolean(c))

    // Campaign medallions are tiered — only render the highest clasp the member holds.
    const CAMPAIGN_RANK: Citation[] = [
        'campaign', 'campaign1', 'campaign2', 'campaign3', 'campaign4',
        'campaign5', 'campaign6', 'campaign7', 'campaign8', 'campaign9',
        'campaign10', 'campaign11', 'campaign12', 'campaign13', 'campaign14',
        'campaign15', 'campaign16',
    ]
    const heldCampaigns = CAMPAIGN_RANK.filter(c => allCitations.includes(c))
    const highestCampaign = heldCampaigns.at(-1)
    const citations = allCitations
        .filter(c => !CAMPAIGN_RANK.includes(c))
        .concat(highestCampaign ? [highestCampaign] : [])

    const medallions = deriveMedallions(awardNames)

    const trainingMedals = (user.milpac?.qualifications ?? [])
        .map(q => QUAL_TO_BADGE[q.qualification])
        .filter((b): b is TrainingBadge => Boolean(b))

    const badge: Badge = orbatEntry
        ? (SECTION_TO_BADGE[orbatEntry.section] ?? DEFAULT_BADGE)
        : DEFAULT_BADGE

    const uniform = orbatEntry?.section === '1-3 HOTEL - ROTARY WING' ? 'Blue' : 'Brown'

    // BCT 2 cert gates the embellishment; rank determines PTE vs PTEP (gold) variant.
    // REC holders never show the badge. LCPL+ with BCT 2 get the gold PTEP badge.
    const hasBct2 = (user.milpac?.qualifications ?? []).some(q => q.qualification === 'BCT 2')
    const rifleManBadge: 'PTE' | 'PTEP' | '' =
        hasBct2 && rank !== 'REC'
            ? (PTE_BASIC_RANKS.has(rank) ? 'PTE' : 'PTEP')
            : ''

    return {
        name: user.id,
        displayName: resolvedDisplayName,
        rank: rank as Rank,
        Uniform: uniform,
        badge,
        medallions,
        citations,
        TrainingMedals: trainingMedals,
        RifleManBadge: rifleManBadge,
    }
}

export function buildBoxData(user: User): BoxData {
    const awardNames = user.milpac?.awards?.map(a => a.name) ?? []
    return { name: user.id, medals: awardNames }
}

export function computeUniformHash(uniformData: UniformData, boxData: BoxData): string {
    return createHash('md5')
        .update(JSON.stringify({ uniformData, boxData }))
        .digest('hex')
}
