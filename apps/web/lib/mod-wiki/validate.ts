import { MOD_WIKI_CATEGORY_KEYS } from './search'
import type { ModWikiArticleFields } from './store'

export const MOD_WIKI_LIMITS = {
    title: 120,
    summary: 300,
    body: 100_000,
    note: 1_000,
    keyword: 60,
    keywords: 40,
    pbo: 80,
    pbos: 30,
    version: 80,
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugFromTitle(title: string): string {
    return title.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
}

function str(v: unknown, max: number): string {
    return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function list(v: unknown, maxItems: number, maxLen: number): string[] {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : []
    return [...new Set(raw.map(x => str(x, maxLen)).filter(Boolean))].slice(0, maxItems)
}

export function parseModWikiArticleFields(body: unknown): { fields: ModWikiArticleFields } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const title = str(b.title, MOD_WIKI_LIMITS.title)
    const summary = str(b.summary, MOD_WIKI_LIMITS.summary)
    const text = str(b.body, MOD_WIKI_LIMITS.body)
    if (!title) return { error: 'A title is required.' }
    if (!text) return { error: 'The article needs some text.' }
    const category = MOD_WIKI_CATEGORY_KEYS.includes(b.category as ModWikiCategory) ? b.category as ModWikiCategory : null
    if (!category) return { error: 'Choose a category.' }
    const keywords = list(b.keywords, MOD_WIKI_LIMITS.keywords, MOD_WIKI_LIMITS.keyword).map(k => k.toLowerCase())
    const pbos = list(b.pbos, MOD_WIKI_LIMITS.pbos, MOD_WIKI_LIMITS.pbo)
    const requiredMods = list(b.requiredMods, 20, 60)
    const version = str(b.version, MOD_WIKI_LIMITS.version) || undefined
    const order = typeof b.order === 'number' && Number.isFinite(b.order) ? Math.max(0, Math.min(999, Math.round(b.order))) : undefined
    return {
        fields: {
            title, summary, body: text, category, keywords, pbos, requiredMods,
            version,
            order,
            hidden: b.hidden === true ? true : undefined,
        },
    }
}

export interface ModWikiSuggestionInput {
    kind: ModWikiSuggestionKind
    articleSlug?: string
    baseVersion?: number
    title: string
    body: string
    summary?: string
    category?: ModWikiCategory
    note?: string
}

const KINDS: ModWikiSuggestionKind[] = ['edit', 'new', 'bug']

export function parseModWikiSuggestion(body: unknown): { input: ModWikiSuggestionInput } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const kind = KINDS.includes(b.kind as ModWikiSuggestionKind) ? b.kind as ModWikiSuggestionKind : null
    if (!kind) return { error: 'Unknown kind of suggestion.' }
    const articleSlug = typeof b.articleSlug === 'string' && SLUG_RE.test(b.articleSlug) ? b.articleSlug : undefined
    if (kind === 'edit' && !articleSlug) return { error: 'Which article is the edit for?' }

    const title = str(b.title, MOD_WIKI_LIMITS.title)
    const text = str(b.body, MOD_WIKI_LIMITS.body)
    if (!text) return { error: kind === 'bug' ? 'Describe what went wrong.' : 'The article needs some text.' }
    if ((kind === 'edit' || kind === 'new') && !title) return { error: 'A title is required.' }

    const category = MOD_WIKI_CATEGORY_KEYS.includes(b.category as ModWikiCategory) ? b.category as ModWikiCategory : undefined
    const baseVersion = typeof b.baseVersion === 'number' && Number.isInteger(b.baseVersion) && b.baseVersion >= 0 ? b.baseVersion : undefined

    return {
        input: {
            kind,
            articleSlug,
            baseVersion: kind === 'edit' ? baseVersion : undefined,
            title: title || text.split('\n')[0].slice(0, 80),
            body: text,
            summary: kind === 'new' ? str(b.summary, MOD_WIKI_LIMITS.summary) || undefined : undefined,
            category: kind === 'new' ? category : undefined,
            note: str(b.note, MOD_WIKI_LIMITS.note) || undefined,
        },
    }
}
