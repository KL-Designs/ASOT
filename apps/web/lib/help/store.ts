import Db from '@/lib/mongo'
import { BUILT_IN_ARTICLES } from './articles'
import { canRead, type HelpArticleView } from './search'

/**
 * Reading and writing the help wiki's articles. The built-in copies in
 * `lib/help/articles.ts` are the floor; a `help_articles` document with the
 * same slug replaces one, and any other slug adds a new article. Every save
 * first copies what it replaces into `help_revisions`.
 */

function toView(a: Omit<HelpArticle, 'version'> & { version?: number }, builtIn: boolean): HelpArticleView {
    return {
        slug: a._id,
        title: a.title,
        category: a.category,
        summary: a.summary,
        body: a.body,
        audience: a.audience,
        paths: a.paths ?? [],
        keywords: a.keywords ?? [],
        tutorial: a.tutorial || undefined,
        order: a.order,
        hidden: a.hidden || undefined,
        version: a.version ?? 0,
        builtIn,
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : undefined,
        updatedByName: a.updatedByName,
    }
}

/** Every article, hidden ones included. */
export async function loadAllArticles(): Promise<HelpArticleView[]> {
    const saved = await Db.helpArticles.find({}).toArray()
    const bySlug = new Map(saved.map(a => [a._id, a]))
    const out: HelpArticleView[] = BUILT_IN_ARTICLES.map(a => {
        const own = bySlug.get(a._id)
        bySlug.delete(a._id)
        return own ? toView(own, false) : toView(a, true)
    })
    for (const a of bySlug.values()) out.push(toView(a, false))
    return out
}

/** The articles a reader at `level` may see. Reviewers also get hidden ones. */
export async function loadVisibleArticles(level: HelpAudience, includeHidden = false): Promise<HelpArticleView[]> {
    const all = await loadAllArticles()
    return all.filter(a => (includeHidden || !a.hidden) && (includeHidden || canRead(a.audience, level)))
}

export async function loadArticle(slug: string): Promise<HelpArticleView | null> {
    const own = await Db.helpArticles.findOne({ _id: slug })
    if (own) return toView(own, false)
    const seed = BUILT_IN_ARTICLES.find(a => a._id === slug)
    return seed ? toView(seed, true) : null
}

export type ArticleFields = Pick<HelpArticleView, 'title' | 'category' | 'summary' | 'body' | 'audience' | 'paths' | 'keywords' | 'tutorial' | 'order' | 'hidden'>

export interface SaveBy { id: string; name: string }

/**
 * Write a new version of an article (creating it when the slug is new), after
 * copying the current one into `help_revisions`. Returns the saved article.
 */
export async function saveArticle(
    slug: string,
    fields: ArticleFields,
    by: SaveBy,
    reason: HelpRevision['reason'],
    suggestionId?: string,
): Promise<HelpArticleView> {
    const current = await loadArticle(slug)
    const now = new Date()
    if (current) {
        await Db.helpRevisions.insertOne({
            slug,
            version: current.version,
            title: current.title,
            summary: current.summary,
            body: current.body,
            category: current.category,
            audience: current.audience,
            paths: current.paths,
            keywords: current.keywords,
            tutorial: current.tutorial,
            hidden: current.hidden,
            savedAt: now,
            savedById: by.id,
            savedByName: by.name,
            reason,
            suggestionId,
        })
    }
    const doc: HelpArticle = {
        _id: slug,
        title: fields.title,
        category: fields.category,
        summary: fields.summary,
        body: fields.body,
        audience: fields.audience,
        paths: fields.paths,
        keywords: fields.keywords,
        ...(fields.tutorial ? { tutorial: fields.tutorial } : {}),
        ...(fields.order !== undefined ? { order: fields.order } : {}),
        ...(fields.hidden ? { hidden: true } : {}),
        version: (current?.version ?? 0) + 1,
        updatedAt: now,
        updatedById: by.id,
        updatedByName: by.name,
    }
    await Db.helpArticles.replaceOne({ _id: slug }, doc, { upsert: true })
    return toView(doc, false)
}

export function fieldsOf(a: HelpArticleView): ArticleFields {
    return {
        title: a.title, category: a.category, summary: a.summary, body: a.body, audience: a.audience,
        paths: a.paths, keywords: a.keywords, tutorial: a.tutorial, order: a.order, hidden: a.hidden,
    }
}
