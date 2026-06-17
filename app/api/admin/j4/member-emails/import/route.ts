import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    for (const raw of text.split(/\r?\n/)) {
        if (!raw.trim()) continue
        const cells: string[] = []
        let cur = ''
        let inQuote = false
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i]
            if (ch === '"') {
                if (inQuote && raw[i + 1] === '"') { cur += '"'; i++ }
                else inQuote = !inQuote
            } else if (ch === ',' && !inQuote) {
                cells.push(cur.trim()); cur = ''
            } else {
                cur += ch
            }
        }
        cells.push(cur.trim())
        rows.push(cells)
    }
    return rows
}

function splitEmails(raw: string): string[] {
    return raw
        .split(/ \/ | and /i)
        .map(s => s.trim())
        .filter(s => s.includes('@'))
}

// ── Name normalisation ────────────────────────────────────────────────────────

const RANK_PREFIXES = new Set([
    'pvt','pfc','cpl','spc','sgt','ssgt','ssg','sfc','msg','1sg','sgm','csm','sma',
    'wo1','wo2','cw2','cw3','cw4','cw5',
    '2lt','1lt','lt','cpt','maj','ltc','col','ltcol','lt-col','bg','mg','ltg','gen',
    'rct','rec','pte','lcpl','cpl2','mcpl',
])

function normalizeName(raw: string): string {
    if (!raw) return ''
    let s = raw.replace(/\s*[\[(][^\])']*[\])']/g, '').trim()
    const words = s.split(/\s+/)
    while (words.length > 1) {
        const w = words[0].toLowerCase().replace(/[^a-z0-9-]/g, '')
        if (RANK_PREFIXES.has(w)) words.shift()
        else break
    }
    return words.join(' ').toLowerCase().trim()
}

// ── Levenshtein distance ──────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    if (m === 0) return n
    if (n === 0) return m
    const row = Array.from({ length: n + 1 }, (_, i) => i)
    for (let i = 1; i <= m; i++) {
        let prev = i
        for (let j = 1; j <= n; j++) {
            const val = a[i - 1] === b[j - 1]
                ? row[j - 1]
                : 1 + Math.min(prev, row[j], row[j - 1])
            row[j - 1] = prev
            prev = val
        }
        row[n] = prev
    }
    return row[n]
}

// ── Matching ──────────────────────────────────────────────────────────────────

export type Confidence = 'exact' | 'normalized' | 'partial' | 'fuzzy'

export interface Candidate {
    memberId: string
    memberName: string
    confidence: Confidence
    source?: 'lh'
}

export interface ParsedRow {
    csvName: string
    emails: string[]
}

export interface MatchedRow extends ParsedRow {
    memberId: string
    memberName: string
    confidence: Confidence
    source?: 'lh'
}

export interface UncertainRow extends ParsedRow {
    candidates: Candidate[]
}

function buildMemberIndex(users: any[]) {
    const exactMap = new Map<string, string>()
    const wordMap  = new Map<string, string[]>()
    const allNorms: { norm: string; memberId: string }[] = []
    const idToName = new Map<string, string>()

    for (const u of users) {
        const id = String(u._id)
        const displayName = u.guild?.nickname ?? u.guild?.displayName ?? (u as any).name ?? u.globalName ?? u.username ?? id
        idToName.set(id, displayName)

        const rawNames = [
            u.guild?.nickname,
            u.guild?.displayName,
            (u as any).name,
            u.globalName,
            u.username,
        ].filter(Boolean) as string[]

        for (const raw of rawNames) {
            const norm = normalizeName(raw)
            if (!norm) continue
            if (!exactMap.has(norm)) exactMap.set(norm, id)
            for (const word of norm.split(/\s+/)) {
                if (word.length >= 3) {
                    const list = wordMap.get(word) ?? []
                    if (!list.includes(id)) list.push(id)
                    wordMap.set(word, list)
                }
            }
            if (!allNorms.some(x => x.norm === norm && x.memberId === id)) {
                allNorms.push({ norm, memberId: id })
            }
        }
    }

    return { exactMap, wordMap, allNorms, idToName }
}

function matchName(
    csvName: string,
    idx: ReturnType<typeof buildMemberIndex>,
): { matched: Candidate | null; candidates: Candidate[] } {
    const norm = csvName.toLowerCase().trim()
    if (!norm) return { matched: null, candidates: [] }

    const toCandidate = (id: string, conf: Confidence): Candidate =>
        ({ memberId: id, memberName: idx.idToName.get(id) ?? id, confidence: conf })

    // 1. Exact normalised match
    const exactId = idx.exactMap.get(norm)
    if (exactId) return { matched: toCandidate(exactId, 'exact'), candidates: [] }

    // 2. Strip rank prefix from CSV name and retry
    const stripped = normalizeName(norm)
    if (stripped !== norm) {
        const strippedId = idx.exactMap.get(stripped)
        if (strippedId) return { matched: toCandidate(strippedId, 'normalized'), candidates: [] }
    }

    // 3. Partial word match — every word in csvName appears in member normalised name
    const csvWords = norm.split(/\s+/).filter(w => w.length >= 3)
    if (csvWords.length > 0) {
        const sets = csvWords.map(w => new Set(idx.wordMap.get(w) ?? []))
        const common = [...sets[0]].filter(id => sets.every(s => s.has(id)))
        if (common.length === 1) return { matched: toCandidate(common[0], 'partial'), candidates: [] }
        if (common.length > 1) return { matched: null, candidates: common.map(id => toCandidate(id, 'partial')) }
    }

    // 4. Fuzzy (Levenshtein)
    const maxDist = norm.length <= 5 ? 1 : 2
    const fuzzy = idx.allNorms
        .map(({ norm: mNorm, memberId }) => ({ dist: levenshtein(norm, mNorm), memberId }))
        .filter(x => x.dist <= maxDist)
        .sort((a, b) => a.dist - b.dist)

    if (fuzzy.length > 0) {
        return { matched: null, candidates: fuzzy.slice(0, 3).map(f => toCandidate(f.memberId, 'fuzzy')) }
    }

    return { matched: null, candidates: [] }
}

// ── Column layout ─────────────────────────────────────────────────────────────
// The spreadsheet columns (1-indexed): 1=empty/flag, 2=SECTION, 3=POSITION, 4=NAME, 5=EMAIL, 6=notes
// As 0-indexed:
const COL_SECTION = 1
const COL_NAME    = 3
const COL_EMAIL   = 4
const COL_NOTES   = 5

// POST /api/admin/j4/member-emails/import
// Returns a dry-run match analysis (no DB writes). Use /import/confirm to commit.
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let csvText: string
    try {
        const fd = await req.formData()
        const file = fd.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        csvText = await file.arrayBuffer().then(b => Buffer.from(b).toString('utf-8'))
    } catch {
        return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
    }

    const allUsers = await Db.users.find(
        { isSkeletonAccount: { $ne: true } },
        { projection: { _id: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1, name: 1 } }
    ).toArray()

    const idx = buildMemberIndex(allUsers)
    const rows = parseCSV(csvText)

    const confirmed: MatchedRow[] = []
    const uncertain: UncertainRow[] = []
    const unmatched: ParsedRow[] = []
    let skipped = 0
    let inPreviousSection = false

    for (const row of rows) {
        const section  = row[COL_SECTION]?.trim() ?? ''
        const name     = row[COL_NAME]?.trim()    ?? ''
        const emailRaw = row[COL_EMAIL]?.trim()   ?? ''
        const notes    = row[COL_NOTES]?.trim()   ?? ''

        // Section header detection: section column has content but name + email are empty
        if (section && !name && !emailRaw) {
            if (section.toLowerCase().includes('previous')) inPreviousSection = true
            continue
        }

        if (!name || !emailRaw) continue
        if (notes.toUpperCase().includes('DO NOT USE')) { skipped++; continue }

        const emails = splitEmails(emailRaw)
        if (emails.length === 0) continue

        const parsed: ParsedRow = { csvName: name, emails }
        const { matched, candidates } = matchName(name, idx)

        if (matched) {
            confirmed.push({ ...parsed, memberId: matched.memberId, memberName: matched.memberName, confidence: matched.confidence })
        } else if (candidates.length > 0) {
            uncertain.push({ ...parsed, candidates })
        } else {
            unmatched.push(parsed)
        }
    }

    // ── Leaving History fallback for rows still unmatched against users ────────
    if (unmatched.length > 0) {
        const lhRecords = await Db.leavingHistory.find(
            {},
            { projection: { _id: 1, name: 1, discordId: 1 } }
        ).toArray()

        if (lhRecords.length > 0) {
            // Build member-index-compatible objects: _id stringifies to 'lh:<ObjectId>'
            const lhUsers = lhRecords.map(rec => ({
                _id: `lh:${rec._id.toString()}` as any,
                name: rec.name,
            }))
            const lhIdx = buildMemberIndex(lhUsers)
            const lhById = new Map(lhRecords.map(r => [`lh:${r._id.toString()}`, r]))

            type LhPending = { parsed: ParsedRow; lhId: string; confidence: Confidence }
            const lhPending: LhPending[] = []
            const lhUncertainRows: UncertainRow[] = []
            const stillUnmatched: ParsedRow[] = []

            for (const parsed of unmatched) {
                const { matched, candidates } = matchName(parsed.csvName, lhIdx)
                if (matched) {
                    lhPending.push({ parsed, lhId: matched.memberId, confidence: matched.confidence })
                } else if (candidates.length > 0) {
                    lhUncertainRows.push({ ...parsed, candidates: candidates.map(c => ({ ...c, source: 'lh' as const })) })
                } else {
                    stillUnmatched.push(parsed)
                }
            }

            // For LH matches that have a discordId, try to resolve to a current user
            const discordIdSet = new Set<string>()
            for (const { lhId } of lhPending) {
                const rec = lhById.get(lhId)
                if (rec?.discordId) discordIdSet.add(rec.discordId)
            }
            const resolvedUsers = discordIdSet.size > 0
                ? await Db.users.find(
                    { id: { $in: [...discordIdSet] } },
                    { projection: { _id: 1, id: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1, name: 1 } }
                  ).toArray()
                : []
            const discordIdToUser = new Map<string, typeof resolvedUsers[number]>(
                resolvedUsers.map(u => [String((u as any).id), u])
            )

            for (const { parsed, lhId, confidence } of lhPending) {
                const lhRec = lhById.get(lhId)
                if (lhRec?.discordId) {
                    const user = discordIdToUser.get(lhRec.discordId)
                    if (user) {
                        const uid = String(user._id)
                        const uName = (user as any).guild?.nickname ?? (user as any).guild?.displayName ?? (user as any).name ?? (user as any).globalName ?? (user as any).username ?? uid
                        confirmed.push({ ...parsed, memberId: uid, memberName: uName, confidence, source: 'lh' })
                        continue
                    }
                }
                confirmed.push({ ...parsed, memberId: lhId, memberName: lhRec?.name ?? lhId, confidence, source: 'lh' })
            }

            uncertain.push(...lhUncertainRows)
            unmatched.length = 0
            unmatched.push(...stillUnmatched)
        }
    }

    return NextResponse.json({
        ok: true,
        confirmed,
        uncertain,
        unmatched,
        skipped,
        inPreviousSection,
        totalRows: rows.length,
    })
}
