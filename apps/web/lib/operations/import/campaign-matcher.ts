/**
 * lib/operations/import/campaign-matcher.ts
 *
 * Fuzzy-matches a document title against existing campaigns and missions
 * using Fuse.js to suggest campaign/mission linkage.
 */

import Fuse from 'fuse.js'

export interface CampaignMatchResult {
    campaignId: string
    campaignName: string
    missionId?: string
    missionName?: string
    confidence: number
    reason: string
}

const STRIP_PREFIXES = ['operation ', 'op ', 'exercise ', 'ex ']
const STRIP_PUNCTUATION = /[^a-z0-9\s]/g
const COLLAPSE_WHITESPACE = /\s+/g

function normalise(str: string): string {
    return str
        .toLowerCase()
        .replace(STRIP_PUNCTUATION, ' ')
        .replace(COLLAPSE_WHITESPACE, ' ')
        .trim()
}

function stripPrefixes(str: string): string {
    for (const prefix of STRIP_PREFIXES) {
        if (str.startsWith(prefix)) return str.slice(prefix.length)
    }
    return str
}

function buildSearchTerms(title: string): string[] {
    const norm = normalise(title)
    const stripped = stripPrefixes(norm)
    const terms = new Set([norm, stripped])
    // Also add each word as a potential match
    stripped.split(' ').filter(w => w.length > 2).forEach(w => terms.add(w))
    return [...terms]
}

/** Convert a Fuse.js score (0=perfect, 1=worst) to confidence (0=worst, 1=best) */
function fuseScoreToConfidence(score: number | undefined): number {
    if (score === undefined) return 0
    return Math.max(0, 1 - score)
}

export async function matchCampaignMission(
    docTitle: string,
    campaigns: OperationCampaign[],
    missions: CampaignMission[]
): Promise<CampaignMatchResult[]> {
    if (!docTitle || campaigns.length === 0) return []

    const searchTerms = buildSearchTerms(docTitle)

    // Build campaign index
    const campaignEntries = campaigns
        .filter(c => !c.isDeleted)
        .map(c => ({
            id: c._id.toString(),
            name: c.name,
            normName: stripPrefixes(normalise(c.name)),
        }))

    const campaignFuse = new Fuse(campaignEntries, {
        keys: ['normName'],
        threshold: 0.4,
        includeScore: true,
    })

    // Score each search term against campaigns and take the best per campaign
    const campaignScores = new Map<string, number>()
    for (const term of searchTerms) {
        const results = campaignFuse.search(term)
        for (const r of results) {
            const conf = fuseScoreToConfidence(r.score)
            const existing = campaignScores.get(r.item.id) ?? 0
            if (conf > existing) campaignScores.set(r.item.id, conf)
        }
    }

    const candidates: CampaignMatchResult[] = []

    for (const [campaignId, campaignConf] of campaignScores.entries()) {
        const campaign = campaigns.find(c => c._id.toString() === campaignId)
        if (!campaign) continue

        // Try to also match a mission within this campaign
        const campaignMissions = missions.filter(m => m.campaignId === campaignId && !m.isDeleted)

        if (campaignMissions.length === 0) {
            candidates.push({
                campaignId,
                campaignName: campaign.name,
                confidence: campaignConf * 0.6, // campaign only
                reason: `Campaign name matched with ${Math.round(campaignConf * 100)}% confidence`,
            })
            continue
        }

        const missionEntries = campaignMissions.map(m => ({
            id: m._id!.toString(),
            name: m.name,
            normName: stripPrefixes(normalise(m.name)),
        }))

        const missionFuse = new Fuse(missionEntries, {
            keys: ['normName'],
            threshold: 0.4,
            includeScore: true,
        })

        let bestMissionScore = 0
        let bestMissionId: string | undefined
        let bestMissionName: string | undefined

        for (const term of searchTerms) {
            const results = missionFuse.search(term)
            for (const r of results) {
                const conf = fuseScoreToConfidence(r.score)
                if (conf > bestMissionScore) {
                    bestMissionScore = conf
                    bestMissionId = r.item.id
                    bestMissionName = r.item.name
                }
            }
        }

        const combinedScore = campaignConf * 0.6 + bestMissionScore * 0.4

        const confidenceLabel =
            combinedScore > 0.8 ? 'high' :
            combinedScore >= 0.5 ? 'medium' : 'low'

        candidates.push({
            campaignId,
            campaignName: campaign.name,
            missionId: bestMissionId,
            missionName: bestMissionName,
            confidence: combinedScore,
            reason: `Campaign matched at ${Math.round(campaignConf * 100)}%${bestMissionName ? `, mission "${bestMissionName}" matched at ${Math.round(bestMissionScore * 100)}%` : ''} — ${confidenceLabel} confidence`,
        })
    }

    // Sort by confidence descending and return top 3
    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}
