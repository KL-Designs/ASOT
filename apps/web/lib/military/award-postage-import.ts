/**
 * Row 384: J4's two-column import of physical-award preferences, kept off the
 * website (no addresses): a member, and whether they take postage. Pure, so the
 * matching can be tested; the route applies what it returns.
 */

export type ImportPreference = 'yes' | 'no' | 'unassigned'

export interface ImportRow {
    line: number
    member: string
    value: string
}

/** Pasted from a spreadsheet (tabs) or a CSV file (commas, maybe quoted). */
export function parseImport(text: string): ImportRow[] {
    const rows: ImportRow[] = []
    text.split(/\r?\n/).forEach((raw, i) => {
        if (!raw.trim()) return
        const cells = raw.includes('\t') ? raw.split('\t') : splitCsv(raw)
        const member = (cells[0] ?? '').trim()
        const value = (cells[1] ?? '').trim()
        if (!member) return
        rows.push({ line: i + 1, member, value })
    })
    // A header row ("Member, Postage") is not a member.
    if (rows.length && readPreference(rows[0].value) === null && /member|name/i.test(rows[0].member)) rows.shift()
    return rows
}

function splitCsv(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
        } else if (ch === ',' && !quoted) {
            out.push(cur); cur = ''
        } else cur += ch
    }
    out.push(cur)
    return out
}

/** Yes, no or blank in the many ways a spreadsheet spells them. Null: not understood. */
export function readPreference(value: string): ImportPreference | null {
    const v = value.trim().toLowerCase()
    if (['yes', 'y', 'true', '1', 'accept', 'accepted', 'x', '✓'].includes(v)) return 'yes'
    if (['no', 'n', 'false', '0', 'decline', 'declined'].includes(v)) return 'no'
    if (['', 'unassigned', 'unknown', '-', 'n/a', 'na', 'tbc', '?'].includes(v)) return 'unassigned'
    return null
}

/** Lower case, no [tags], single spaces, no full stops: "Cpl. J. Smith [LOA]" → "cpl j smith". */
export function normaliseName(name: string): string {
    return name.replace(/\[[^\]]*\]/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface ImportMember {
    userId: string
    names: string[]
}

/**
 * Which member each row means: their Discord ID, or any of their names with
 * or without the rank in front. A name two members share is not guessed at.
 */
export function matchRows(rows: ImportRow[], members: ImportMember[], rankAbbrs: readonly string[]) {
    const ranks = new Set(rankAbbrs.map(r => r.toLowerCase().replace(/\./g, '')))
    const stripRank = (n: string) => {
        const [first, ...rest] = n.split(' ')
        return rest.length && ranks.has(first) ? rest.join(' ') : n
    }
    const index = new Map<string, Set<string>>()
    const add = (key: string, userId: string) => {
        if (!key) return
        if (!index.has(key)) index.set(key, new Set())
        index.get(key)!.add(userId)
    }
    for (const m of members) {
        add(m.userId, m.userId)
        for (const n of m.names) {
            const k = normaliseName(n)
            add(k, m.userId)
            add(stripRank(k), m.userId)
        }
    }

    const matched: { line: number; member: string; userId: string; preference: ImportPreference }[] = []
    const unmatched: { line: number; member: string; reason: string }[] = []
    for (const r of rows) {
        const preference = readPreference(r.value)
        if (!preference) { unmatched.push({ line: r.line, member: r.member, reason: `"${r.value}" is not yes or no` }); continue }
        const key = normaliseName(r.member)
        const hits = index.get(r.member.trim()) ?? index.get(key) ?? index.get(stripRank(key))
        if (!hits) { unmatched.push({ line: r.line, member: r.member, reason: 'No member by that name' }); continue }
        if (hits.size > 1) { unmatched.push({ line: r.line, member: r.member, reason: 'More than one member has that name' }); continue }
        matched.push({ line: r.line, member: r.member, userId: [...hits][0], preference })
    }
    return { matched, unmatched }
}
