import { canSee, pathSpecificity, stem, tokenize, type HelpArticleView, type HelpReaderScope } from './search'

/**
 * The help assistant's memory of what people ask. Pure: the database half is
 * `questions-db.ts`.
 *
 * Every question asked on the Ask tab is folded into a `help_questions` entry
 * (rewordings of the same question share one, matched by their words), which
 * gives three things:
 *  - the **living FAQ**: entries asked by enough different people, most-asked
 *    first, with the assistant's answer (or J7's), shown on /help and in the
 *    panel, and per page as "Common questions on this page";
 *  - **drafts for J7**: a question asked by several people becomes a proposed
 *    FAQ guide in J7's queue, written from the assistant's answer;
 *  - **gaps and faults for J7**: a question the guides couldn't answer, or one
 *    that points at something broken on the site, is raised to J7 straight away.
 */

/** Suggestions the assistant raises are authored by this id, not a member. */
export const HELP_ASSISTANT_ID = 'help-assistant'
export const HELP_ASSISTANT_NAME = 'Help assistant (AI)'

/** Different people who must ask before an answered question shows in the FAQ. */
export const FAQ_MIN_ASKERS = 2
/** Different people who must ask before the assistant drafts a FAQ guide for J7. */
export const DRAFT_MIN_ASKERS = 3
/** How alike two questions' words must be to count as the same question. */
export const MATCH_THRESHOLD = 0.6
export const MAX_ASKER_IDS = 500

export type AskOutcome = HelpQuestion['outcome']

/** The words a question is matched on: stemmed, de-duplicated, sorted. */
export function questionTokens(question: string): string[] {
    return [...new Set(tokenize(question).map(stem))].sort()
}

export function jaccard(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0
    const sb = new Set(b)
    const inter = a.filter(t => sb.has(t)).length
    return inter / (a.length + b.length - inter)
}

/**
 * The existing entry a new question belongs to, if any: the most alike one at
 * or over the threshold. Questions of one or two words must match exactly,
 * since "rsvp" and "rsvp discord" are not the same question.
 */
export function matchQuestion<T extends { tokens: string[] }>(tokens: string[], candidates: T[]): T | null {
    let best: T | null = null
    let bestScore = 0
    for (const c of candidates) {
        const short = tokens.length <= 2 || c.tokens.length <= 2
        const score = jaccard(tokens, c.tokens)
        const ok = short ? score === 1 : score >= MATCH_THRESHOLD
        if (ok && score > bestScore) { best = c; bestScore = score }
    }
    return best
}

/**
 * A page path as an FAQ entry remembers it: query and hash dropped, and
 * id-like segments (Mongo ids, numbers, long slugs with digits) folded to `*`,
 * so every operation's page counts as one page.
 */
export function pageKey(pathname: string): string {
    const clean = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
    if (clean === '/') return '/'
    return '/' + clean.split('/').slice(1, 5).map(seg =>
        /^[0-9a-f]{24}$/i.test(seg) || /^\d+$/.test(seg) || (seg.length > 12 && /\d/.test(seg)) ? '*' : seg,
    ).join('/')
}

/**
 * The model ends every answer with a status line (`HELP_ASK_RULES`). Take it
 * off, and read what it says. A reply without one counts as answered.
 */
export function parseAskReply(reply: string): { answer: string; outcome: AskOutcome; issue?: string } {
    const lines = reply.trimEnd().split('\n')
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
        const m = /^\s*\**STATUS\**\s*:\s*\**\s*(answered|unanswered|site[- ]issue)\b\**\s*(?:[:—–-]\s*(.*))?$/i.exec(lines[i])
        if (!m) continue
        const kind = m[1].toLowerCase().replace(' ', '-')
        const answer = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').trim()
        const issue = m[2]?.trim().replace(/\*+$/, '').trim() || undefined
        if (kind === 'site-issue') return { answer, outcome: 'site-issue', issue: issue ?? 'The assistant thinks something on the site is not working as the guides describe.' }
        return { answer, outcome: kind as AskOutcome }
    }
    return { answer: reply.trim(), outcome: 'answered' }
}

/**
 * Who may later read this answer in the FAQ: the highest audience among the
 * guides the assistant was shown, and the department limits of the guides it
 * cited (or of every guide shown, when it cited none).
 */
export function answerScope(shown: HelpArticleView[], cited: string[]): { audience: HelpAudience; departments?: string[] } {
    const rank: Record<HelpAudience, number> = { public: 0, member: 1, staff: 2 }
    const audience = shown.reduce<HelpAudience>((acc, a) => rank[a.audience] > rank[acc] ? a.audience : acc, 'public')
    const basis = cited.length ? shown.filter(a => cited.includes(a.slug)) : shown
    const departments = [...new Set(basis.flatMap(a => a.departments ?? []))]
    return { audience, departments: departments.length ? departments : undefined }
}

/** What the assistant should raise with J7 after this asking, if anything. */
export function suggestionToRaise(q: Pick<HelpQuestion, 'outcome' | 'distinctAskers' | 'suggestionId' | 'suggestionKind' | 'articleSlug' | 'hidden' | 'answer'>): HelpSuggestionKind | null {
    if (q.hidden || q.articleSlug) return null
    // A fault outranks a missing answer: one already raised as a question is raised again as a bug.
    if (q.outcome === 'site-issue') return q.suggestionKind === 'bug' ? null : 'bug'
    if (q.suggestionId) return null
    if (q.outcome === 'unanswered') return 'question'
    if (q.outcome === 'answered' && q.answer && q.distinctAskers >= DRAFT_MIN_ASKERS) return 'new'
    return null
}

/** A FAQ entry as readers get it. */
export interface FaqEntry {
    id: string
    question: string
    answer: string
    sources: string[]
    askers: number
    pages: string[]
    articleSlug?: string
    pinned?: boolean
}

/**
 * Whether an entry belongs in the FAQ for this reader: pinned by J7, or
 * answered and asked by enough people; never hidden; within the reader's
 * audience and departments; and every guide it cites still readable by them.
 */
export function faqVisible(q: HelpQuestion, reader: HelpReaderScope, readable: Set<string>): boolean {
    if (q.hidden) return false
    const answer = q.editedAnswer ?? q.answer
    if (!answer) return false
    if (!q.pinned && (q.outcome !== 'answered' || q.distinctAskers < FAQ_MIN_ASKERS)) return false
    if (!canSee({ audience: q.audience, departments: q.departments }, reader)) return false
    return (q.sources ?? []).every(s => readable.has(s))
}

/** Pinned first, then most askers, then most recent. */
export function sortFaq<T extends Pick<HelpQuestion, 'pinned' | 'distinctAskers' | 'lastAskedAt'>>(entries: T[]): T[] {
    return [...entries].sort((a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned)
        || b.distinctAskers - a.distinctAskers
        || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime())
}

/** FAQ entries asked on (or under) this page, most asked first. */
export function faqForPath(entries: FaqEntry[], pathname: string, limit = 4): FaqEntry[] {
    const here = pageKey(pathname)
    return entries.filter(e => pathSpecificity(e.pages, here) > 0).slice(0, limit)
}

/** An entry as J7 sees it in the Questions view: everything but who asked. */
export interface HelpQuestionView {
    id: string
    question: string
    askCount: number
    askers: number
    firstAskedAt: string
    lastAskedAt: string
    pages: { path: string; count: number }[]
    answer?: string
    editedAnswer?: string
    sources: string[]
    outcome: AskOutcome
    issue?: string
    audience: HelpAudience
    departments?: string[]
    pinned?: boolean
    hidden?: boolean
    suggestionId?: string
    suggestionKind?: HelpSuggestionKind
    articleSlug?: string
    /** Whether readers see it in the FAQ (before the per-reader audience check). */
    inFaq: boolean
}

export function toQuestionView(q: HelpQuestion): HelpQuestionView {
    const answer = q.editedAnswer ?? q.answer
    return {
        id: String(q._id),
        question: q.question,
        askCount: q.askCount,
        askers: q.distinctAskers,
        firstAskedAt: new Date(q.firstAskedAt).toISOString(),
        lastAskedAt: new Date(q.lastAskedAt).toISOString(),
        pages: q.pages,
        answer: q.answer,
        editedAnswer: q.editedAnswer,
        sources: q.sources ?? [],
        outcome: q.outcome,
        issue: q.issue,
        audience: q.audience,
        departments: q.departments,
        pinned: q.pinned || undefined,
        hidden: q.hidden || undefined,
        suggestionId: q.suggestionId,
        suggestionKind: q.suggestionKind,
        articleSlug: q.articleSlug,
        inFaq: !q.hidden && !!answer && (!!q.pinned || (q.outcome === 'answered' && q.distinctAskers >= FAQ_MIN_ASKERS)),
    }
}
