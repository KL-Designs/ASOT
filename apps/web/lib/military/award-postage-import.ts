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

/** Lower case, no [tags] or (tags), letters and digits only, single spaces: "Cpl. J. Smith [LOA]" → "cpl j smith". */
export function normaliseName(name: string): string {
    return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface ImportMember {
    userId: string
    names: string[]
}

/**
 * Which member each row means. Tried in order, stopping at the first that
 * finds exactly one member:
 *
 *   1. their Discord ID;
 *   2. any of their names, with or without the rank (which a spreadsheet
 *      usually leaves off, and a nickname usually has);
 *   3. the same with the spaces taken out ("J.Smith" and "J Smith");
 *   4. every word of one name found in the other ("John Smith" for "J Smith"
 *      does not, "Smith" alone does if only one member is a Smith).
 *
 * A name two members share is reported, never guessed at.
 */
export function matchRows(rows: ImportRow[], members: ImportMember[], rankAbbrs: readonly string[]) {
    const ranks = new Set(rankAbbrs.map(r => normaliseName(r)).filter(Boolean))
    const stripRank = (n: string) => {
        const words = n.split(' ')
        while (words.length > 1 && ranks.has(words[0])) words.shift()
        return words.join(' ')
    }
    const exact = new Map<string, Set<string>>()
    const compact = new Map<string, Set<string>>()
    const add = (map: Map<string, Set<string>>, key: string, userId: string) => {
        if (!key) return
        if (!map.has(key)) map.set(key, new Set())
        map.get(key)!.add(userId)
    }
    const wordsOf = new Map<string, string[][]>()
    for (const m of members) {
        add(exact, m.userId, m.userId)
        const list: string[][] = []
        for (const n of m.names) {
            const k = normaliseName(n)
            const bare = stripRank(k)
            add(exact, k, m.userId)
            add(exact, bare, m.userId)
            add(compact, bare.replace(/ /g, ''), m.userId)
            if (bare) list.push(bare.split(' '))
        }
        wordsOf.set(m.userId, list)
    }

    const fuzzy = (bare: string): Set<string> | undefined => {
        const mine = bare.split(' ').filter(Boolean)
        if (!mine.length) return undefined
        const hits = new Set<string>()
        for (const [userId, lists] of wordsOf) {
            if (lists.some(theirs => mine.every(w => theirs.includes(w)) || (theirs.length > 1 && theirs.every(w => mine.includes(w))))) hits.add(userId)
        }
        return hits.size ? hits : undefined
    }

    const matched: { line: number; member: string; userId: string; preference: ImportPreference }[] = []
    const unmatched: { line: number; member: string; reason: string }[] = []
    for (const r of rows) {
        const preference = readPreference(r.value)
        if (!preference) { unmatched.push({ line: r.line, member: r.member, reason: `"${r.value}" is not yes, no or unassigned` }); continue }
        const key = normaliseName(r.member)
        const bare = stripRank(key)
        const hits = exact.get(r.member.trim()) ?? exact.get(key) ?? exact.get(bare) ?? compact.get(bare.replace(/ /g, '')) ?? fuzzy(bare)
        if (!hits) { unmatched.push({ line: r.line, member: r.member, reason: 'No member by that name' }); continue }
        if (hits.size > 1) { unmatched.push({ line: r.line, member: r.member, reason: 'More than one member has that name' }); continue }
        matched.push({ line: r.line, member: r.member, userId: [...hits][0], preference })
    }
    return { matched, unmatched }
}
