import { CATEGORY_KEYS, HELP_AUDIENCES } from './search'
import type { ArticleFields } from './store'

/**
 * Checking what readers and reviewers send to the help wiki's routes. Pure, so
 * the limits are tested without a database.
 */

export const LIMITS = {
    title: 120,
    summary: 240,
    body: 20_000,
    note: 1_000,
    path: 200,
    paths: 20,
    keywords: 30,
    keyword: 40,
    question: 600,
}

export const DEPARTMENT_CODES = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugFromTitle(title: string): string {
    return title.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
}

function str(v: unknown, max: number): string {
    return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function list(v: unknown, maxItems: number, maxLen: number): string[] {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : []
    return [...new Set(raw.map(x => str(x, maxLen)).filter(Boolean))].slice(0, maxItems)
}

/** A page path an article can be about: starts with `/`, `*` allowed as a whole segment. */
export function cleanPath(p: string): string | null {
    const t = p.trim().split('?')[0].split('#')[0]
    if (!t.startsWith('/') || t.startsWith('//')) return null
    if (!/^[A-Za-z0-9/_*.-]*$/.test(t)) return null
    return t.length > 1 ? t.replace(/\/+$/, '') : t
}

export function parseArticleFields(body: unknown): { fields: ArticleFields } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const title = str(b.title, LIMITS.title)
    const summary = str(b.summary, LIMITS.summary)
    const text = str(b.body, LIMITS.body)
    if (!title) return { error: 'A title is required.' }
    if (!text) return { error: 'The article needs some text.' }
    const category = CATEGORY_KEYS.includes(b.category as HelpCategory) ? b.category as HelpCategory : null
    if (!category) return { error: 'Choose a category.' }
    const audience = HELP_AUDIENCES.includes(b.audience as HelpAudience) ? b.audience as HelpAudience : 'member'
    const paths = list(b.paths, LIMITS.paths, LIMITS.path).map(cleanPath).filter((p): p is string => !!p)
    const keywords = list(b.keywords, LIMITS.keywords, LIMITS.keyword).map(k => k.toLowerCase())
    const tutorial = str(b.tutorial, 60)
    const departments = list(b.departments, 7, 4).map(d => d.toLowerCase()).filter(d => DEPARTMENT_CODES.includes(d))
    const order = typeof b.order === 'number' && Number.isFinite(b.order) ? Math.max(0, Math.min(999, Math.round(b.order))) : undefined
    return {
        fields: {
            title, summary, body: text, category, audience, paths, keywords,
            tutorial: tutorial && SLUG_RE.test(tutorial) ? tutorial : undefined,
            departments: departments.length ? departments : undefined,
            order,
            hidden: b.hidden === true ? true : undefined,
        },
    }
}

export interface SuggestionInput {
    kind: HelpSuggestionKind
    articleSlug?: string
    baseVersion?: number
    title: string
    body: string
    summary?: string
    category?: HelpCategory
    note?: string
    pagePath?: string
}

const KINDS: HelpSuggestionKind[] = ['edit', 'new', 'bug', 'question']

export function parseSuggestion(body: unknown): { input: SuggestionInput } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const kind = KINDS.includes(b.kind as HelpSuggestionKind) ? b.kind as HelpSuggestionKind : null
    if (!kind) return { error: 'Unknown kind of suggestion.' }
    const articleSlug = typeof b.articleSlug === 'string' && SLUG_RE.test(b.articleSlug) ? b.articleSlug : undefined
    if (kind === 'edit' && !articleSlug) return { error: 'Which article is the edit for?' }

    const title = str(b.title, LIMITS.title)
    const text = str(b.body, kind === 'question' ? LIMITS.question * 4 : LIMITS.body)
    if (!text) return { error: kind === 'bug' ? 'Describe what went wrong.' : kind === 'question' ? 'Write your question.' : 'The article needs some text.' }
    if ((kind === 'edit' || kind === 'new') && !title) return { error: 'A title is required.' }

    const pagePath = cleanPath(str(b.pagePath, LIMITS.path)) ?? undefined
    const category = CATEGORY_KEYS.includes(b.category as HelpCategory) ? b.category as HelpCategory : undefined
    const baseVersion = typeof b.baseVersion === 'number' && Number.isInteger(b.baseVersion) && b.baseVersion >= 0 ? b.baseVersion : undefined

    return {
        input: {
            kind,
            articleSlug,
            baseVersion: kind === 'edit' ? baseVersion : undefined,
            // A bug or question with no headline gets the start of its text.
            title: title || text.split('\n')[0].slice(0, 80),
            body: text,
            summary: kind === 'new' ? str(b.summary, LIMITS.summary) || undefined : undefined,
            category: kind === 'new' ? category : undefined,
            note: str(b.note, LIMITS.note) || undefined,
            pagePath,
        },
    }
}
