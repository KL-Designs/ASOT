import type { ObjectId } from 'mongodb'

/** A suggestion as the J7 tab and its author see it. */
export interface HelpSuggestionView {
    id: string
    kind: HelpSuggestionKind
    articleSlug?: string
    baseVersion?: number
    title: string
    body: string
    summary?: string
    category?: HelpCategory
    note?: string
    pagePath?: string
    status: HelpSuggestionStatus
    authorId: string
    authorName: string
    createdAt: string
    reviewedByName?: string
    reviewedAt?: string
    reviewNote?: string
}

export function toSuggestionView(s: HelpSuggestion & { _id?: ObjectId }): HelpSuggestionView {
    return {
        id: String(s._id),
        kind: s.kind,
        articleSlug: s.articleSlug,
        baseVersion: s.baseVersion,
        title: s.title,
        body: s.body,
        summary: s.summary,
        category: s.category,
        note: s.note,
        pagePath: s.pagePath,
        status: s.status,
        authorId: s.authorId,
        authorName: s.authorName,
        createdAt: new Date(s.createdAt).toISOString(),
        reviewedByName: s.reviewedByName,
        reviewedAt: s.reviewedAt ? new Date(s.reviewedAt).toISOString() : undefined,
        reviewNote: s.reviewNote,
    }
}

export const SUGGESTION_KIND_LABEL: Record<HelpSuggestionKind, string> = {
    edit: 'Edit suggestion',
    new: 'New article idea',
    bug: 'Bug report',
    question: 'Question',
}
