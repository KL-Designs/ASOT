export interface BordaEntry {
    candidateId: string
    totalScore: number
    averageRank: number
    validReviewCount: number
    firstPlaceCount: number
    selfRankedFirst: boolean
    tied: boolean
}

export function calcBordaResults(
    submissions: Pick<PeerReviewSubmission, 'reviewerCandidateId' | 'ranking' | 'isIncomplete' | 'status'>[],
    candidateIds: string[],
): BordaEntry[] {
    const validSubs = submissions.filter(s =>
        s.ranking.length > 0 &&
        (s.status === 'ranking_complete' || s.status === 'feedback_active' || s.status === 'time_expired' || s.status === 'submitted')
    )

    const scores: Record<string, { total: number; ranks: number[]; firstPlace: number }> = {}
    for (const cid of candidateIds) {
        scores[cid] = { total: 0, ranks: [], firstPlace: 0 }
    }

    for (const sub of validSubs) {
        const N = sub.ranking.length
        for (let i = 0; i < sub.ranking.length; i++) {
            const cid = sub.ranking[i]
            if (cid === sub.reviewerCandidateId) continue   // exclude self-ranking from score
            if (!scores[cid]) continue
            const points = N - i
            scores[cid].total += points
            scores[cid].ranks.push(i + 1)
            if (i === 0) scores[cid].firstPlace++
        }
    }

    const entries: BordaEntry[] = candidateIds.map(cid => {
        const s = scores[cid] ?? { total: 0, ranks: [], firstPlace: 0 }
        const avg = s.ranks.length > 0
            ? s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length
            : 0
        const selfRankedFirst = validSubs.some(sub =>
            sub.reviewerCandidateId === cid && sub.ranking[0] === cid
        )
        return { candidateId: cid, totalScore: s.total, averageRank: avg, validReviewCount: s.ranks.length, firstPlaceCount: s.firstPlace, selfRankedFirst, tied: false }
    })

    // Mark ties (same total score)
    const sorted = [...entries].sort((a, b) => b.totalScore - a.totalScore)
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].totalScore === sorted[i + 1].totalScore && sorted[i].totalScore > 0) {
            sorted[i].tied = true
            sorted[i + 1].tied = true
        }
    }

    return sorted
}
