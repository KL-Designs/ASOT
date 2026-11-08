import { ObjectId } from 'mongodb'

export { }

/**
 * The site-wide help wiki: the "?" button on every page, `/help`, and the J7
 * "Help Wiki" review tab. See `lib/help/` for how the pieces fit.
 */
declare global {

    /** Who an article is written for. Each level also sees the levels below it. */
    type HelpAudience = 'public' | 'member' | 'staff'

    type HelpCategory =
        | 'getting-started'
        | 'operations'
        | 'community'
        | 'profile'
        | 'training'
        | 'tickets'
        | 'departments'
        | 'faq'

    /**
     * One wiki article. The built-in starter articles live in
     * `lib/help/articles.ts`; a document in `help_articles` with the same slug
     * replaces one, and one with a new slug adds to them. `hidden` takes a
     * built-in article down without deleting the code copy.
     */
    interface HelpArticle {
        /** URL slug, `/help/{slug}`. */
        _id: string
        title: string
        category: HelpCategory
        /** One line, shown in lists and search results. */
        summary: string
        /** The article, in the wiki's small Markdown dialect (`lib/help/markdown.ts`). */
        body: string
        audience: HelpAudience
        /**
         * Pages the article is about. A path matches itself and anything under
         * it, so `/dashboard/j3` covers every J3 tab. Drives "On this page".
         */
        paths: string[]
        keywords: string[]
        /** Id of a guided walkthrough this article can launch, when one exists. */
        tutorial?: string
        /** Order within its category; lower first. */
        order?: number
        hidden?: boolean
        /** Bumped on every saved change. Built-in articles start at 0. */
        version: number
        updatedAt?: Date
        updatedById?: string
        updatedByName?: string
    }

    type HelpSuggestionKind = 'edit' | 'new' | 'bug' | 'question'
    type HelpSuggestionStatus = 'pending' | 'approved' | 'rejected'

    /** Something a reader sent in from the wiki, waiting for J7. */
    interface HelpSuggestion {
        _id?: ObjectId
        kind: HelpSuggestionKind
        /** The article it is about. Required for `edit`; optional otherwise. */
        articleSlug?: string
        /** The article's version when the edit was written, to warn about a stale base. */
        baseVersion?: number
        /** `edit`/`new`: the proposed title. `bug`/`question`: a short headline. */
        title: string
        /** `edit`/`new`: the proposed article body. `bug`/`question`: the description. */
        body: string
        /** `new`: the proposed summary and category. */
        summary?: string
        category?: HelpCategory
        /** Why the edit is needed, in the reader's words. */
        note?: string
        /** The page the reader was on when they sent it. */
        pagePath?: string
        status: HelpSuggestionStatus
        authorId: string
        authorName: string
        createdAt: Date
        reviewedById?: string
        reviewedByName?: string
        reviewedAt?: Date
        reviewNote?: string
    }

    /** A copy of an article as it stood before a change, for history and restore. */
    interface HelpRevision {
        _id?: ObjectId
        slug: string
        version: number
        title: string
        summary: string
        body: string
        category: HelpCategory
        audience: HelpAudience
        paths: string[]
        keywords: string[]
        tutorial?: string
        hidden?: boolean
        savedAt: Date
        savedById?: string
        savedByName?: string
        /** What replaced it: a direct edit, an approved suggestion, or a restore. */
        reason: 'edit' | 'suggestion' | 'restore'
        suggestionId?: string
    }
}
