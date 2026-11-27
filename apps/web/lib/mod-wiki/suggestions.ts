import { ObjectId } from 'mongodb'

export const MOD_WIKI_SUGGESTION_KIND_LABEL: Record<ModWikiSuggestionKind, string> = {
    edit: 'Edit suggestion',
    new: 'New article idea',
    bug: 'Bug report',
}

export interface ModWikiSuggestionView {
    id: string
    kind: ModWikiSuggestionKind
    articleSlug?: string
    baseVersion?: number
    title: string
    body: string
    summary?: string
    category?: ModWikiCategory
    note?: string
    status: ModWikiSuggestionStatus
    authorId: string
    authorName: string
    createdAt: string
    reviewedById?: string
    reviewedByName?: string
    reviewedAt?: string
    reviewNote?: string
}

export function toModWikiSuggestionView(s: ModWikiSuggestion & { _id: ObjectId }): ModWikiSuggestionView {
    return {
        id: s._id.toString(),
        kind: s.kind,
        articleSlug: s.articleSlug,
        baseVersion: s.baseVersion,
        title: s.title,
        body: s.body,
        summary: s.summary,
        category: s.category,
        note: s.note,
        status: s.status,
        authorId: s.authorId,
        authorName: s.authorName,
        createdAt: s.createdAt.toISOString(),
        reviewedById: s.reviewedById,
        reviewedByName: s.reviewedByName,
        reviewedAt: s.reviewedAt?.toISOString(),
        reviewNote: s.reviewNote,
    }
}
