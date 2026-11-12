import { helpMarkdownToText } from './markdown'

/**
 * Searching and filtering the help wiki. Pure: the drawer and `/help` run it in
 * the browser over the articles `GET /api/help` sent, and the AI route runs it
 * on the server to choose which articles to show the model.
 */

/** An article as the client sees it (and as the search works on it). */
export interface HelpArticleView {
    slug: string
    title: string
    category: HelpCategory
    summary: string
    body: string
    audience: HelpAudience
    paths: string[]
    keywords: string[]
    tutorial?: string
    /** Department codes whose members may read it; absent for everyone the audience allows. */
    departments?: string[]
    order?: number
    hidden?: boolean
    version: number
    /** True when the article is still the built-in copy from `lib/help/articles.ts`. */
    builtIn: boolean
    updatedAt?: string
    updatedByName?: string
}

export type HelpGroup = 'start' | 'site' | 'departments' | 'faq'

export const HELP_GROUPS: { key: HelpGroup; label: string }[] = [
    { key: 'start', label: 'Start here' },
    { key: 'site', label: 'Using the site' },
    { key: 'departments', label: 'Departments' },
    { key: 'faq', label: 'Questions' },
]

export const HELP_CATEGORIES: { key: HelpCategory; label: string; blurb: string; group: HelpGroup }[] = [
    { key: 'getting-started', label: 'Getting started', blurb: 'Joining, signing in and finding your way round', group: 'start' },
    { key: 'operations', label: 'Operations', blurb: 'Missions, RSVPs, attendance, AARs and maps', group: 'site' },
    { key: 'community', label: 'Community', blurb: 'The ORBAT, MILPACS, kits, gallery and more', group: 'site' },
    { key: 'profile', label: 'Your profile', blurb: 'Your record, preferences and notifications', group: 'site' },
    { key: 'training', label: 'Training', blurb: 'Courses, qualifications, SOPs and guides', group: 'site' },
    { key: 'tickets', label: 'Tickets & feedback', blurb: 'Requests, bug reports, awards and complaints', group: 'site' },
    { key: 'dashboard', label: 'Dashboard & staff tools', blurb: 'Calendar, tasks, meetings, personnel and the ORBAT manager', group: 'site' },
    { key: 'departments', label: 'Departments overview', blurb: 'What J1 to J7 do', group: 'departments' },
    { key: 'j1', label: 'J1 Recruitment', blurb: 'Applications, recruit sessions and induction', group: 'departments' },
    { key: 'j2', label: 'J2 Mission Making', blurb: 'Operations, checks, doctrine and intel', group: 'departments' },
    { key: 'j3', label: 'J3 Training', blurb: 'Training events, tickets, records and Selection', group: 'departments' },
    { key: 'j4', label: 'J4 Administration', blurb: 'Mastersheet, tickets, awards, backups and tools', group: 'departments' },
    { key: 'j5', label: 'J5 Media', blurb: 'Gallery media, submissions and features', group: 'departments' },
    { key: 'j6', label: 'J6 Game Masters', blurb: 'Zeus notes and running missions', group: 'departments' },
    { key: 'j7', label: 'J7 Community Development', blurb: 'The board and this help wiki', group: 'departments' },
    { key: 'faq', label: 'FAQ', blurb: 'Quick answers to common questions', group: 'faq' },
]

export const CATEGORY_KEYS = HELP_CATEGORIES.map(c => c.key)

export const HELP_AUDIENCES: HelpAudience[] = ['public', 'member', 'staff']

const AUDIENCE_RANK: Record<HelpAudience, number> = { public: 0, member: 1, staff: 2 }

/** Whether a reader at `level` may read an article written for `audience`. */
export function canRead(audience: HelpAudience, level: HelpAudience): boolean {
    return AUDIENCE_RANK[audience] <= AUDIENCE_RANK[level]
}

/** What decides which guides a reader sees. */
export interface HelpReaderScope {
    level: HelpAudience
    /** Department codes the reader belongs to. */
    departments: string[]
    /** J7 reviewers and J4 administration: every department's guides. */
    allDepartments: boolean
}

/** Whether a reader may see a guide (or FAQ entry) with this audience and department limit. */
export function canSee(item: { audience: HelpAudience; departments?: string[] }, reader: HelpReaderScope): boolean {
    if (!canRead(item.audience, reader.level)) return false
    if (!item.departments?.length || reader.allDepartments) return true
    return item.departments.some(d => reader.departments.includes(d))
}

/**
 * How specifically one of an article's paths describes the page at `pathname`:
 * 0 for no match, otherwise the number of segments matched, so `/dashboard/j3`
 * outranks `/dashboard` on a J3 page. A `*` segment matches any one segment
 * (`/operations/*` for a single operation). `/` matches the home page only.
 */
export function pathSpecificity(paths: string[], pathname: string): number {
    const page = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
    const pageSegs = page === '/' ? [] : page.split('/').slice(1)
    let best = 0
    for (const raw of paths) {
        const p = raw.replace(/\/+$/, '') || '/'
        if (p === '/') { if (page === '/') best = Math.max(best, 1); continue }
        const segs = p.split('/').slice(1)
        if (segs.length > pageSegs.length) continue
        if (segs.every((s, i) => s === '*' || s === pageSegs[i])) best = Math.max(best, segs.length + 1)
    }
    return best
}

function byOrder(a: HelpArticleView, b: HelpArticleView) {
    return (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title)
}

/** The articles about the page at `pathname`, most specific first. */
export function articlesForPath(articles: HelpArticleView[], pathname: string, limit = 6): HelpArticleView[] {
    return articles
        .map(a => ({ a, s: pathSpecificity(a.paths, pathname) }))
        .filter(x => x.s > 0)
        .sort((x, y) => y.s - x.s || byOrder(x.a, y.a))
        .slice(0, limit)
        .map(x => x.a)
}

export function articlesInCategory(articles: HelpArticleView[], category: HelpCategory): HelpArticleView[] {
    return articles.filter(a => a.category === category).sort(byOrder)
}

const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'so', 'the', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your', 'there', 'this', 'that', 'want', 'would', 'should', 'need', 'about', 'into', 'some', 'any', 'have', 'has', 'was', 'were', 'will', 'im'])

export function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t))
}

/** A crude stem so "tickets"/"ticket", "attending"/"attend" and "raise"/"raising" meet. */
export function stem(word: string): string {
    let t = word
    if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3)
    else if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y'
    else if (t.length > 4 && /(ch|sh|x|ss)es$/.test(t)) t = t.slice(0, -2)
    else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
    else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2)
    if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1)
    return t
}

export interface HelpSearchHit {
    article: HelpArticleView
    score: number
    /** A short stretch of the body around the first match, when the match was in the body. */
    snippet?: string
}

function countIn(words: string[], term: string): number {
    let n = 0
    for (const w of words) if (w === term || (term.length >= 3 && w.startsWith(term))) n++
    return n
}

function makeSnippet(text: string, terms: string[]): string | undefined {
    const lower = text.toLowerCase()
    let at = -1
    for (const t of terms) {
        const i = lower.search(new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`))
        if (i >= 0 && (at < 0 || i < at)) at = i
    }
    if (at < 0) return undefined
    const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 60)) + 1)
    const end = Math.min(text.length, at + 140)
    return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

/**
 * Rank articles against a free-text query. Title and keyword matches count
 * most, then the summary, then the body. An article must match at least half
 * the query's terms (all of them for one or two terms) to be returned, so a
 * stray common word does not drag in the whole wiki.
 */
export function searchArticles(articles: HelpArticleView[], query: string, limit = 20): HelpSearchHit[] {
    const terms = [...new Set(tokenize(query).map(stem))]
    if (!terms.length) return []
    const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2)
    const phrase = query.trim().toLowerCase().replace(/[?!.]+$/, '')
    const phraseRe = phrase.length > 3 ? new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null

    const hits: HelpSearchHit[] = []
    for (const article of articles) {
        const bodyText = helpMarkdownToText(article.body)
        const title = tokenize(article.title).map(stem)
        const keywords = article.keywords.flatMap(k => tokenize(k)).map(stem)
        const summary = tokenize(article.summary).map(stem)
        const body = tokenize(bodyText).map(stem)

        let score = 0
        let matched = 0
        let bodyOnly = true
        for (const t of terms) {
            const inTitle = countIn(title, t)
            const inKeywords = countIn(keywords, t)
            const inSummary = countIn(summary, t)
            const inBody = countIn(body, t)
            if (inTitle + inKeywords + inSummary + inBody === 0) continue
            matched++
            if (inTitle + inKeywords + inSummary) bodyOnly = false
            score += inTitle * 8 + inKeywords * 5 + inSummary * 3 + Math.min(inBody, 5)
        }
        if (matched < need) continue
        // The whole query as written, as whole words: "rsvp" is not a phrase match for "RSVPs".
        if (phraseRe?.test(article.title)) score += 15
        else if (phraseRe?.test(bodyText)) score += 6
        score += matched * 4

        hits.push({ article, score, snippet: bodyOnly ? makeSnippet(bodyText, terms) : undefined })
    }
    return hits.sort((a, b) => b.score - a.score || byOrder(a.article, b.article)).slice(0, limit)
}

const SITE_SUFFIX = /\s*[|·–—-]\s*(Australian Special Operations Taskforce|ASOT)\s*$/i
const SITE_ONLY = /^(Australian Special Operations Taskforce|ASOT)$/i

/**
 * A name for the page the reader is on, for "Ask about this page" and the
 * assistant's prompt: the page's own title when it sets one, otherwise its
 * path in words (`/dashboard/j1` → "Dashboard › J1"), skipping ids.
 */
export function pageLabel(pathname: string, docTitle?: string): string {
    const t = docTitle?.replace(SITE_SUFFIX, '').trim()
    if (t && !SITE_ONLY.test(t)) return t.slice(0, 80)
    const segs = (pathname.split('?')[0].split('#')[0]).split('/').filter(Boolean)
        .filter(seg => !/^[0-9a-f]{24}$/i.test(seg) && !/^\d+$/.test(seg) && !(seg.length > 12 && /\d/.test(seg)))
    if (!segs.length) return 'Home'
    return segs.map(seg => /^j[1-7]$/i.test(seg) ? seg.toUpperCase() : seg.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase())).join(' › ')
}
