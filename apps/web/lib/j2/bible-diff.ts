/**
 * What changed between two versions of the Mission Making Bible.
 *
 * The Bible is a long document that J2 leads revise and publish as numbered
 * versions. A mission maker who read version 6 needs to see what version 7
 * changed, not reread the whole thing — so two versions are compared and the
 * result is shown with additions and removals marked.
 *
 * The comparison works on *blocks* (a heading, a paragraph, a list item, a
 * table cell), because that is the unit a reader thinks in: "this rule was
 * added", "this paragraph was reworded". A block that was reworded is then
 * compared word by word, so the reader sees which words moved rather than a
 * struck-out paragraph next to its near-identical replacement.
 *
 * Pure and import-free. It reads HTML with regular expressions rather than a
 * DOM, which is enough here: the HTML is what the site's own editor writes and
 * the server has already sanitised, and all this needs from it is each block's
 * tag and its text.
 */

export interface BibleBlock {
    /** h1–h6, p, li, td, th, blockquote. */
    tag: string
    text: string
}

const BLOCK = /<(h[1-6]|p|li|td|th|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi

const ENTITIES: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
}

function decode(text: string): string {
    return text
        .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, m => ENTITIES[m] ?? m)
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

/** The text of a fragment: tags dropped, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
    return decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

/**
 * A document as its blocks, in reading order. Empty blocks are dropped: an
 * empty paragraph is spacing, and spacing changing is not a change to report.
 *
 * A list item or table cell that wraps its text in a `<p>` would otherwise be
 * counted twice (once as the `li`, once as the `p`), so the outer one is
 * skipped whenever it contains another block.
 */
export function htmlToBlocks(html: string): BibleBlock[] {
    const blocks: BibleBlock[] = []
    for (const match of html.matchAll(BLOCK)) {
        const tag = match[1].toLowerCase()
        const inner = match[2]
        if (/<(h[1-6]|p|li|td|th|blockquote)\b/i.test(inner)) {
            blocks.push(...htmlToBlocks(inner))
            continue
        }
        const text = textOf(inner)
        if (text) blocks.push({ tag, text })
    }
    return blocks
}

/* ── Longest common subsequence ─────────────────────────────────────────── */

type Step = { op: 'same' | 'removed' | 'added'; a?: number; b?: number }

/**
 * The edit script between two sequences, by longest common subsequence.
 *
 * Quadratic in memory, which is fine at this size (a few hundred blocks, a few
 * dozen words) and is capped by the callers for anything larger.
 */
function editScript<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): Step[] {
    const rows = a.length + 1, cols = b.length + 1
    const table = new Uint32Array(rows * cols)
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            table[i * cols + j] = same(a[i], b[j])
                ? table[(i + 1) * cols + j + 1] + 1
                : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
        }
    }

    const steps: Step[] = []
    let i = 0, j = 0
    while (i < a.length && j < b.length) {
        if (same(a[i], b[j])) { steps.push({ op: 'same', a: i++, b: j++ }) }
        else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) { steps.push({ op: 'removed', a: i++ }) }
        else { steps.push({ op: 'added', b: j++ }) }
    }
    while (i < a.length) steps.push({ op: 'removed', a: i++ })
    while (j < b.length) steps.push({ op: 'added', b: j++ })
    return steps
}

/* ── Words ──────────────────────────────────────────────────────────────── */

export interface WordPart {
    op: 'same' | 'removed' | 'added'
    text: string
}

/** A reworded block, word by word. Runs of the same kind are joined. */
export function diffWords(before: string, after: string): WordPart[] {
    const a = before.split(/\s+/).filter(Boolean)
    const b = after.split(/\s+/).filter(Boolean)
    const parts: WordPart[] = []
    for (const step of editScript(a, b, (x, y) => x === y)) {
        const text = step.op === 'added' ? b[step.b as number] : a[step.a as number]
        const last = parts[parts.length - 1]
        if (last && last.op === step.op) last.text += ` ${text}`
        else parts.push({ op: step.op, text })
    }
    return parts
}

/** How alike two blocks are, 0–1, by shared words. Decides "reworded" vs "replaced". */
export function similarity(before: string, after: string): number {
    const a = before.toLowerCase().split(/\s+/).filter(Boolean)
    const b = after.toLowerCase().split(/\s+/).filter(Boolean)
    if (!a.length || !b.length) return 0
    const counts = new Map<string, number>()
    for (const word of a) counts.set(word, (counts.get(word) ?? 0) + 1)
    let shared = 0
    for (const word of b) {
        const left = counts.get(word) ?? 0
        if (left > 0) { shared++; counts.set(word, left - 1) }
    }
    return (2 * shared) / (a.length + b.length)
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

export type BlockChange =
    | { op: 'same' | 'added' | 'removed'; tag: string; text: string }
    | { op: 'changed'; tag: string; text: string; parts: WordPart[] }

/** Above this, a removed block and the added one after it read as one edit. */
const REWORDED = 0.5

/**
 * The change list between two versions, in the new version's reading order
 * with removals placed where they used to be.
 *
 * A removal directly followed by an addition is paired into one `changed`
 * block when the two are alike enough to be the same sentence reworded;
 * otherwise they stay as a removal and an addition, which is what they are.
 */
export function diffBlocks(before: readonly BibleBlock[], after: readonly BibleBlock[]): BlockChange[] {
    const steps = editScript(before, after, (x, y) => x.tag === y.tag && x.text === y.text)
    const changes: BlockChange[] = []

    for (let k = 0; k < steps.length; k++) {
        const step = steps[k]
        if (step.op === 'same') {
            changes.push({ op: 'same', ...after[step.b as number] })
            continue
        }

        // Gather the run of removals, then the run of additions after it.
        const removed: BibleBlock[] = []
        const added: BibleBlock[] = []
        while (k < steps.length && steps[k].op === 'removed') removed.push(before[steps[k++].a as number])
        while (k < steps.length && steps[k].op === 'added') added.push(after[steps[k++].b as number])
        k--

        // Pair them off in order while they still look like the same block.
        let r = 0, a = 0
        while (r < removed.length && a < added.length && similarity(removed[r].text, added[a].text) >= REWORDED) {
            changes.push({ op: 'changed', tag: added[a].tag, text: added[a].text, parts: diffWords(removed[r].text, added[a].text) })
            r++; a++
        }
        for (; r < removed.length; r++) changes.push({ op: 'removed', ...removed[r] })
        for (; a < added.length; a++) changes.push({ op: 'added', ...added[a] })
    }
    return changes
}

export interface DiffSummary { added: number; removed: number; changed: number }

export function summariseDiff(changes: readonly BlockChange[]): DiffSummary {
    return {
        added: changes.filter(c => c.op === 'added').length,
        removed: changes.filter(c => c.op === 'removed').length,
        changed: changes.filter(c => c.op === 'changed').length,
    }
}

/**
 * Only what changed, each with the heading it sits under, for the "recent
 * changes only" view. Unchanged blocks are dropped except the nearest heading
 * above a change — a reworded sentence with no idea which section it is in is
 * not much use.
 */
export function changesOnly(changes: readonly BlockChange[]): BlockChange[] {
    const out: BlockChange[] = []
    let heading: BlockChange | null = null
    let headingShown = false
    for (const change of changes) {
        const isHeading = /^h[1-6]$/.test(change.tag)
        if (change.op === 'same') {
            if (isHeading) { heading = change; headingShown = false }
            continue
        }
        if (heading && !headingShown && !isHeading) { out.push(heading); headingShown = true }
        if (isHeading) { heading = change; headingShown = true }
        out.push(change)
    }
    return out
}
