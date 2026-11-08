/**
 * A line diff for J7's review cards: which lines an edit suggestion removes
 * and adds. Plain LCS — articles are tens of lines, so the quadratic table is
 * nothing — and pure, so it is tested.
 */

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string }

export function diffLines(before: string, after: string): DiffLine[] {
    const a = before.replace(/\r\n?/g, '\n').split('\n')
    const b = after.replace(/\r\n?/g, '\n').split('\n')
    const n = a.length
    const m = b.length
    // lcs[i][j] = length of the LCS of a[i..] and b[j..]
    const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
        }
    }
    const out: DiffLine[] = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++ }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++ }
        else { out.push({ type: 'add', text: b[j] }); j++ }
    }
    while (i < n) out.push({ type: 'del', text: a[i++] })
    while (j < m) out.push({ type: 'add', text: b[j++] })
    return out
}

/** How many lines an edit adds and removes, for the card's headline. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
    return {
        added: lines.filter(l => l.type === 'add').length,
        removed: lines.filter(l => l.type === 'del').length,
    }
}
