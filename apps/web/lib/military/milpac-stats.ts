import { calculateOpPoints, calculatePromotionPoints } from '@/lib/military/points'
import { parseMilpacDate } from '@/lib/military/milpac-dates'
import { RANK_TRACKS } from '@/lib/military/promotion-requirements'

/**
 * The figures a member's service is summarised by.
 *
 * Extracted from the profile page when the Discord dossier card needed the same
 * five numbers. Promotion points in particular are recalculated live from
 * confirmed attendance rather than read off the document, and a second copy of
 * that arithmetic is a second answer to "am I due a promotion".
 */

/** One operation a member is confirmed as having attended. */
export type ConfirmedOp = {
    operationId: string
    name: string
    date: Date | null
    confirmedAt: Date | null
    /** Snapshotted per record: where this member sat AT THAT OPERATION. */
    unit: string | null
    section: string | null
    role: string | null
    ocap: OcapData | null
}

export async function loadConfirmedOps(memberId: string): Promise<ConfirmedOp[]> {
    // Imported here rather than at module scope: this file also exports pure
    // helpers the card and the tests use, and lib/mongo throws on import when
    // MONGO_URI is unset — which would make a date-formatting test require a
    // database. The same reason milpac-cover defers @napi-rs/canvas.
    const { default: Db } = await import('@/lib/mongo')

    const attendanceDocs = await Db.operationAttendance.find({
        records: { $elemMatch: { userId: memberId, confirmed: true } },
    }).toArray()

    const operationIds = attendanceDocs.map(d => d.operationId)
    const operationsData = operationIds.length > 0
        // Soft-deleted operations were previously shown in public op history.
        ? await Db.operations.find({ _id: { $in: operationIds }, deletedAt: { $exists: false } }).toArray()
        : []

    const opMap = new Map(operationsData.map(o => [String(o._id), o]))
    const seenOpIds = new Set<string>()

    return attendanceDocs.flatMap(doc => {
        const opId = String(doc.operationId)
        if (seenOpIds.has(opId)) return []
        seenOpIds.add(opId)
        const rec = doc.records.find(r => r.userId === memberId && r.confirmed)
        if (!rec) return []
        const op = opMap.get(opId)
        if (!op) return []
        return [{
            operationId: opId,
            name:        op.title ?? 'Unknown Operation',
            date:        op.date ? new Date(op.date) : null,
            confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt) : null,
            unit:        rec.unit ?? null,
            section:     rec.orbatSection ?? null,
            role:        rec.orbatRole ?? null,
            ocap:        op.ocap ?? null,
        }]
    })
}

/**
 * Promotion points, recalculated live — non-op points from the stored billet
 * counts plus op points from confirmed attendance. Matches the editor's logic.
 *
 * Members without billet counts have never been through the current editor, so
 * their stored total is all there is.
 */
export function resolvePromotionPoints(member: User, confirmedOps: ConfirmedOp[]): number {
    const billetCounts = member.milpac?.billetCounts
    if (!billetCounts) return member.milpac?.promotionPoints ?? 0

    return calculatePromotionPoints({
        ...billetCounts,
        primaryNightOps:   0,
        secondaryNightOps: 0,
        awards:         (member.milpac?.awards         ?? []).map(a => ({ name: a.name })),
        qualifications: (member.milpac?.qualifications ?? []).map(q => ({ qualification: q.qualification })),
        j4Points:             member.milpac?.j4Points            ?? 0,
        disciplineDeductions: member.milpac?.disciplineDeductions ?? 0,
    }) + calculateOpPoints(confirmedOps)
}

/** The stored enlistment date, else the Discord join date, else null. */
export function resolveEnlistedDate(member: User): string | null {
    return member.milpac?.enlistedDate
        || (member.guild?.joinedTimestamp
            ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
            : null)
}

/**
 * Rough duration between a stored date string and now, as `2.4Y` / `7M`.
 *
 * Parsing lives in `milpac-dates` because the certificate route reads the same
 * free-form fields, and two parsers for one format drift. Anything unparseable
 * yields null and the caller renders an em-dash, not `NaN`.
 */
export function durationSince(raw?: string | null): string | null {
    const d = parseMilpacDate(raw)
    if (!d) return null
    const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    if (months < 0) return null
    return months < 12 ? `${Math.max(0, Math.round(months))}M` : `${(months / 12).toFixed(1)}Y`
}

// ── Promotion progress helper ─────────────────────────────────────────────────
export function getPromotionProgress(currentRankAbbr: string | undefined, points: number) {
    if (!currentRankAbbr) return null
    const track = RANK_TRACKS.find(t => t.ranks.some(r => r.abbr === currentRankAbbr))
    if (!track) return null
    const idx = track.ranks.findIndex(r => r.abbr === currentRankAbbr)
    const next = track.ranks[idx + 1]
    if (!next) return { atMax: true as const }
    if (next.minPts === null) return { atMax: false as const, nextRank: next.abbr, billetOnly: true as const }
    // Use the previous rank's threshold as the start of the bar so it shows
    // progress through the current tier, not from 0 to next.minPts.
    const prev = idx > 0 ? track.ranks[idx - 1] : null
    const from = prev?.minPts ?? 0
    const pct = Math.min(100, Math.max(0, ((points - from) / (next.minPts - from)) * 100))
    return { atMax: false as const, nextRank: next.abbr, required: next.minPts, current: points, pct, billetOnly: false as const }
}
