/**
 * Row 373 (Part G): the similarity check on an orders submission. Local word
 * shingling, no AI, so it is free and gives the same answer every time.
 *
 * Military orders share headings, doctrinal terms and stock phrases, so
 * those are stripped before comparing and the result is decision support for
 * the trainer, never an automatic fail. It is stored on the submission and
 * only ever sent to the assigned trainer, J3 leads and J4.
 */

export const SHINGLE = 5

/** Stock phrases every set of orders uses. Removed before shingling. */
const COMMON_PHRASES = [
    'situation', 'mission', 'execution', 'service support', 'command and signal', 'command and signals',
    'enemy forces', 'friendly forces', 'concept of operations', 'coordinating instructions', 'actions on',
    'questions', 'time check', 'ground', 'weather', 'attachments and detachments', 'smeac',
    'grid', 'callsign', 'call sign', 'h hour', 'line of departure', 'rules of engagement',
]

export function normalise(text: string, strip: string[] = []): string[] {
    let t = ` ${text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ')} `
    for (const p of [...strip.map(s => s.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').trim()), ...COMMON_PHRASES].filter(Boolean)) {
        t = t.split(` ${p} `).join(' ')
    }
    return t.trim().split(' ').filter(w => w.length > 1)
}

export function shingles(words: string[], k = SHINGLE): Set<string> {
    const out = new Set<string>()
    for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(' '))
    return out
}

/** Share of A's shingles also in B: "how much of this submission appears there". */
export function containment(a: Set<string>, b: Set<string>): number {
    if (!a.size) return 0
    let hit = 0
    for (const s of a) if (b.has(s)) hit++
    return hit / a.size
}

export type SimilarityLevel = 'none' | 'low' | 'moderate' | 'high'

export function levelOf(score: number): SimilarityLevel {
    if (score >= 0.5) return 'high'
    if (score >= 0.25) return 'moderate'
    if (score >= 0.1) return 'low'
    return 'none'
}

export interface SimilaritySource {
    id: string
    /** "Trainee name · course · date", or "Source orders 2". */
    label: string
    kind: 'submission' | 'source'
    traineeName?: string
    text: string
}

export interface SimilarityMatch {
    sourceId: string
    label: string
    kind: SimilaritySource['kind']
    traineeName?: string
    score: number
    /** Passages of this submission that also appear in the source, longest first. */
    passages: { mine: string; theirs: string }[]
}

export interface SimilarityResult {
    score: number
    level: SimilarityLevel
    matches: SimilarityMatch[]
    checkedAt: string
    comparedWith: number
}

function sentences(text: string): string[] {
    return text.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= SHINGLE)
}

/** Sentences of `mine` sharing at least two shingles with a sentence of `theirs`. */
export function passages(mine: string, theirs: string, strip: string[], limit = 5) {
    const theirSentences = sentences(theirs).map(s => ({ s, sh: shingles(normalise(s, strip)) }))
    const out: { mine: string; theirs: string; overlap: number }[] = []
    for (const m of sentences(mine)) {
        const msh = shingles(normalise(m, strip))
        if (!msh.size) continue
        let best: { s: string; overlap: number } | null = null
        for (const t of theirSentences) {
            let overlap = 0
            for (const x of msh) if (t.sh.has(x)) overlap++
            if (overlap >= 2 && (!best || overlap > best.overlap)) best = { s: t.s, overlap }
        }
        if (best) out.push({ mine: m.slice(0, 500), theirs: best.s.slice(0, 500), overlap: best.overlap })
    }
    return out.sort((a, b) => b.overlap - a.overlap).slice(0, limit).map(({ mine, theirs }) => ({ mine, theirs }))
}

/**
 * Compare one submission with every other relevant text: this cohort, past
 * sessions, and the source orders themselves. Not "who submitted first":
 * the caller also writes the reverse match onto the other submission.
 */
export function compareSubmission(text: string, sources: SimilaritySource[], strip: string[] = [], now = new Date()): SimilarityResult {
    const mine = shingles(normalise(text, strip))
    const matches: SimilarityMatch[] = []
    for (const src of sources) {
        const score = containment(mine, shingles(normalise(src.text, strip)))
        if (score < 0.05) continue
        matches.push({ sourceId: src.id, label: src.label, kind: src.kind, traineeName: src.traineeName, score: Math.round(score * 1000) / 1000, passages: passages(text, src.text, strip) })
    }
    matches.sort((a, b) => b.score - a.score)
    const top = matches.slice(0, 8)
    const score = top[0]?.score ?? 0
    return { score, level: levelOf(score), matches: top, checkedAt: now.toISOString(), comparedWith: sources.length }
}
