/**
 * Reading the pre-website member history CSV, and working out who signed each
 * record.
 *
 * See docs/superpowers/specs/2026-08-18-member-history-import-design.md.
 * Pure: no database, no filesystem, no clock.
 */
import { parseRow } from '@/lib/orbat/csv-parser'
import { resolveRank, resolveAward, resolveRole } from './history-vocab'

export type HistoryRow = {
    member: string
    type: 'promotion' | 'award'
    /** Verbatim from the file. Never reformatted — see the module spec §2. */
    date: string
    award: string
    rank: string
    role: string
    /** 1-based line in the source file, so a skipped row can be traced back. */
    line: number
}

/**
 * Splits the history CSV into rows.
 *
 * Line-splitting before field-splitting is safe for this file specifically:
 * it has no newlines inside quoted fields (1,859 lines for 1,858 records plus
 * a header). `parseRow` handles the quoted commas that every
 * "Campaign Medallion, Nth Clasp" row contains.
 *
 * The `Award Type` column is deliberately not read. It carries 15 spellings
 * for what should be 5 types; the type comes from AWARDS instead.
 */
export function parseHistoryCsv(text: string): HistoryRow[] {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/)
    const rows: HistoryRow[] = []

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue
        const cells = parseRow(lines[i])
        const member = (cells[0] ?? '').trim()
        if (!member) continue

        rows.push({
            member,
            type: (cells[1] ?? '').trim() === 'Award' ? 'award' : 'promotion',
            date: (cells[2] ?? '').trim(),
            award: (cells[3] ?? '').trim(),
            rank: (cells[5] ?? '').trim(),
            role: (cells[6] ?? '').trim(),
            line: i + 1,
        })
    }
    return rows
}

export type Issuer = {
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

/**
 * Who signed a record, by date.
 *
 * `until` is exclusive, so the shared boundary dates in the source mapping
 * (01/01/2023 both ends Thomas and starts Trew) belong to the later officer.
 * A null `until` closes the list.
 *
 * The ranks are the ranks held *at the time*, not today's — Thomas is now
 * LTGEN and Trew is now PTE(SL), and a 2022 certificate signed "LTGEN Thomas"
 * would be a forgery of a document that never existed.
 *
 * `issuedByName` is the bare name and `issuedByRank` the full rank name,
 * because signatoryFor() in the certificate route composes the signature as
 * `{rankAbbrFromName(issuedByRank)} {issuedByName}` itself.
 */
export const ISSUER_WINDOWS: readonly { until: string | null; issuer: Issuer }[] = [
    { until: '2023-01-01', issuer: { issuedById: '224086573560365057', issuedByName: 'Thomas', issuedByRank: 'Major' } },
    { until: '2023-09-02', issuer: { issuedById: '187854741047345152', issuedByName: 'Trew',   issuedByRank: 'Major' } },
    { until: '2025-01-01', issuer: { issuedById: '112039501219586048', issuedByName: 'Jazz',   issuedByRank: 'Major' } },
    { until: '2026-01-01', issuer: { issuedById: '325502946781691916', issuedByName: 'Six',    issuedByRank: 'Brigadier' } },
    { until: null,         issuer: { issuedById: '325502946781691916', issuedByName: 'Six',    issuedByRank: 'Major General' } },
]

/**
 * Parse a date string into a numeric YYYYMMDD value for timezone-agnostic
 * comparison. Accepts 'DD MMMM YYYY', 'MMMM YYYY' (day defaults to 1), and
 * 'YYYY-MM-DD' formats. Returns null if the format is not recognized.
 */
function dateToComparable(dateStr: string): number | null {
    const months: { [key: string]: number } = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
    }

    // Try 'DD MMMM YYYY' format: '01 January 2023'
    const fullMatch = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
    if (fullMatch) {
        const [, day, monthName, year] = fullMatch
        const month = months[monthName.toLowerCase()]
        if (month) {
            return parseInt(year) * 10000 + month * 100 + parseInt(day)
        }
    }

    // 'November 2021' — month and year, no day. One award in the source file is
    // dated this way. The day defaults to the 1st: the value is only ever used
    // to pick an issuer window, never stored, and no window boundary falls
    // mid-month.
    const monthYearMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{4})$/)
    if (monthYearMatch) {
        const [, monthName, year] = monthYearMatch
        const month = months[monthName.toLowerCase()]
        if (month) return parseInt(year) * 10000 + month * 100 + 1
    }

    // Try 'YYYY-MM-DD' format: '2023-01-01'
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) {
        const [, year, month, day] = isoMatch
        return parseInt(year) * 10000 + parseInt(month) * 100 + parseInt(day)
    }

    return null
}

/**
 * The officer of record for a date, or null when the date does not parse.
 *
 * The first window is unbounded at the start on purpose: 23 records predate
 * the supplied mapping and fold into Thomas's window rather than importing
 * with no officer.
 */
export function resolveIssuer(date: string): Issuer | null {
    const at = dateToComparable(date)
    if (at === null) return null

    for (const window of ISSUER_WINDOWS) {
        if (window.until === null) return window.issuer
        const windowUntil = dateToComparable(window.until)
        if (windowUntil !== null && at < windowUntil) return window.issuer
    }
    return null
}

export type PromotionRecord = {
    date: string
    rank: string
    role: string
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

export type AwardRecord = {
    date: string
    name: string
    type: string
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

export type MemberHistory = { promotions: PromotionRecord[]; awards: AwardRecord[] }
export type SkippedRow = { line: number; member: string; reason: string }

export type BuiltHistory = {
    /** Keyed by the CSV's member name — resolving that to a user is history-match's job. */
    byMember: Map<string, MemberHistory>
    skipped: SkippedRow[]
    corrections: { rank: number; award: number; role: number }
}

/**
 * Rows in, the arrays that go into milpac.promotions/awards out.
 *
 * Every row leaves here exactly once, either as a record or as a skip with a
 * reason. Nothing is dropped silently and nothing is guessed: a rank or award
 * that resolves to nothing is a skip, not a best effort.
 */
export function buildHistory(rows: HistoryRow[]): BuiltHistory {
    const byMember = new Map<string, MemberHistory>()
    const skipped: SkippedRow[] = []
    const corrections = { rank: 0, award: 0, role: 0 }

    // Date first, file order second. Sorting up front rather than per member
    // keeps the tie-break stable without threading an index through.
    const ordered = rows
        .map((row, index) => ({ row, index, at: Date.parse(row.date) }))
        .sort((a, b) => (a.at - b.at) || (a.index - b.index))

    const historyFor = (member: string): MemberHistory => {
        const existing = byMember.get(member)
        if (existing) return existing
        const fresh: MemberHistory = { promotions: [], awards: [] }
        byMember.set(member, fresh)
        return fresh
    }

    for (const { row } of ordered) {
        const issuer = resolveIssuer(row.date)
        if (!issuer) {
            skipped.push({ line: row.line, member: row.member, reason: 'no date' })
            continue
        }

        if (row.type === 'promotion') {
            const rank = resolveRank(row.rank)
            if (!rank) {
                skipped.push({ line: row.line, member: row.member, reason: `unknown rank "${row.rank}"` })
                continue
            }
            if (rank !== row.rank.trim()) corrections.rank++

            const role = resolveRole(row.role)
            if (role !== row.role.trim()) corrections.role++

            historyFor(row.member).promotions.push({ date: row.date, rank, role, ...issuer })
        } else {
            const award = resolveAward(row.award)
            if (!award) {
                skipped.push({ line: row.line, member: row.member, reason: `unknown award "${row.award}"` })
                continue
            }
            if (award.name !== row.award.trim()) corrections.award++

            historyFor(row.member).awards.push({ date: row.date, name: award.name, type: award.type, ...issuer })
        }
    }

    return { byMember, skipped, corrections }
}
