import Db from '@/lib/mongo'
import { BUILT_IN_MOD_WIKI_ARTICLES } from './articles'
import type { ModWikiArticleView } from './search'

export type ModWikiArticleFields = Pick<ModWikiArticleView,
    'title' | 'category' | 'summary' | 'body' | 'pbos' | 'requiredMods' | 'version' | 'keywords' | 'order' | 'hidden'
>

function toView(a: Omit<ModWikiArticle, 'version_num'> & { version_num?: number }, builtIn: boolean): ModWikiArticleView {
    return {
        slug: a._id,
        title: a.title,
        category: a.category,
        summary: a.summary,
        body: a.body,
        pbos: a.pbos ?? [],
        requiredMods: a.requiredMods ?? [],
        version: a.version,
        keywords: a.keywords ?? [],
        order: a.order,
        hidden: a.hidden || undefined,
        version_num: a.version_num ?? 0,
        builtIn,
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : undefined,
        updatedByName: a.updatedByName,
    }
}

/** Every article, hidden ones included. */
export async function loadAllModWikiArticles(): Promise<ModWikiArticleView[]> {
    const saved = await Db.modWikiArticles.find({}).toArray()
    const bySlug = new Map(saved.map(a => [a._id, a]))
    const out: ModWikiArticleView[] = BUILT_IN_MOD_WIKI_ARTICLES.map(a => {
        const own = bySlug.get(a._id)
        bySlug.delete(a._id)
        return own ? toView(own, false) : toView(a, true)
    })
    for (const a of bySlug.values()) out.push(toView(a, false))
    return out
}

/** Visible articles: hidden ones are shown only to reviewers. */
export async function loadVisibleModWikiArticles(includeHidden = false): Promise<ModWikiArticleView[]> {
    const all = await loadAllModWikiArticles()
    if (includeHidden) return all
    return all.filter(a => !a.hidden)
}

export async function loadModWikiArticle(slug: string): Promise<ModWikiArticleView | null> {
    const own = await Db.modWikiArticles.findOne({ _id: slug })
    if (own) return toView(own, false)
    const seed = BUILT_IN_MOD_WIKI_ARTICLES.find(a => a._id === slug)
    return seed ? toView(seed, true) : null
}

export interface SaveBy { id: string; name: string }

export async function saveModWikiArticle(
    slug: string,
    fields: ModWikiArticleFields,
    by: SaveBy,
    reason: ModWikiRevision['reason'],
    suggestionId?: string,
): Promise<ModWikiArticleView> {
    const current = await loadModWikiArticle(slug)
    const now = new Date()
    if (current) {
        await Db.modWikiRevisions.insertOne({
            slug,
            version_num: current.version_num,
            title: current.title,
            summary: current.summary,
            body: current.body,
            category: current.category,
            pbos: current.pbos,
            requiredMods: current.requiredMods,
            version: current.version,
            keywords: current.keywords,
            order: current.order,
            hidden: current.hidden,
            savedAt: now,
            savedById: by.id,
            savedByName: by.name,
            reason,
            suggestionId,
        })
    }
    const doc: ModWikiArticle = {
        _id: slug,
        title: fields.title,
        category: fields.category,
        summary: fields.summary,
        body: fields.body,
        pbos: fields.pbos,
        requiredMods: fields.requiredMods,
        ...(fields.version ? { version: fields.version } : {}),
        keywords: fields.keywords,
        ...(fields.order !== undefined ? { order: fields.order } : {}),
        ...(fields.hidden ? { hidden: true } : {}),
        version_num: (current?.version_num ?? 0) + 1,
        updatedAt: now,
        updatedById: by.id,
        updatedByName: by.name,
    }
    await Db.modWikiArticles.replaceOne({ _id: slug }, doc, { upsert: true })
    return toView(doc, false)
}

export function fieldsOfModWikiArticle(a: ModWikiArticleView): ModWikiArticleFields {
    return {
        title: a.title, category: a.category, summary: a.summary, body: a.body,
        pbos: a.pbos, requiredMods: a.requiredMods, version: a.version,
        keywords: a.keywords, order: a.order, hidden: a.hidden,
    }
}
