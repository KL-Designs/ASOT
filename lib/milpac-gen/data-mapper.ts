import { createHash } from 'crypto'
import type { OrbatEntry } from '@/lib/orbat'
import {
    AWARD_TO_CITATION,
    QUAL_TO_BADGE,
    SECTION_TO_BADGE,
    DEFAULT_BADGE,
    rankToUniformColor,
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

/** Strip parentheses so DB ranks like "PTE(S)" become asset-compatible "PTES" */
function normaliseRank(rank: string): string {
    return rank.replace(/[()]/g, '')
}

export function buildUniformData(user: User, orbatEntry: OrbatEntry | null): UniformData {
    const rank = normaliseRank(user.milpac?.currentRank ?? '')
    const awardNames = user.milpac?.awards?.map(a => a.name) ?? []

    const citations = awardNames
        .filter(n => !MEDALLION_AWARDS.has(n))
        .map(n => AWARD_TO_CITATION[n])
        .filter((c): c is Citation => Boolean(c))

    const medallions = deriveMedallions(awardNames)

    const trainingMedals = (user.milpac?.qualifications ?? [])
        .map(q => QUAL_TO_BADGE[q.qualification])
        .filter((b): b is TrainingBadge => Boolean(b))

    const badge: Badge = orbatEntry
        ? (SECTION_TO_BADGE[orbatEntry.section] ?? DEFAULT_BADGE)
        : DEFAULT_BADGE

    return {
        name: user.id,
        displayName: user.name ?? user.id,
        rank: rank as Rank,
        Uniform: rankToUniformColor(rank),
        badge,
        medallions,
        citations,
        TrainingMedals: trainingMedals,
        RifleManBadge: '',  // derived inside generateUniform from rank
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
