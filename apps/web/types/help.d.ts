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
        | 'dashboard'
        | 'departments'
        | 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6' | 'j7'
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
        /**
         * Department codes (`'j1'`…`'j7'`) whose members may read it. Empty or
         * absent: no department limit (the audience still applies). J7
         * reviewers and J4 administration read everything.
         */
        departments?: string[]
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
        /** `HELP_ASSISTANT_ID` when the help assistant raised it itself (`lib/help/questions.ts`). */
        authorId: string
        authorName: string
        /** The asked question this came from, when the assistant raised it. */
        questionId?: string
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
        departments?: string[]
        hidden?: boolean
        savedAt: Date
        savedById?: string
        savedByName?: string
        /** What replaced it: a direct edit, an approved suggestion, or a restore. */
        reason: 'edit' | 'suggestion' | 'restore'
        suggestionId?: string
    }

    /**
     * One question people asked the help assistant, with every rewording of it
     * folded in (`lib/help/questions.ts` matches them by shared words). Drives
     * the living FAQ (most-asked first) and the assistant's suggestions to J7.
     */
    interface HelpQuestion {
        _id?: ObjectId
        /** The wording shown in the FAQ: the first asking, or J7's edit. */
        question: string
        /** Stemmed words of `question`, for matching new askings. */
        tokens: string[]
        askCount: number
        /** Up to 200 distinct askers; `distinctAskers` keeps counting past that. */
        askerIds: string[]
        distinctAskers: number
        firstAskedAt: Date
        lastAskedAt: Date
        /** Pages it was asked from, with counts, for "Common questions on this page". */
        pages: { path: string; count: number }[]
        /** The assistant's latest answer, and the guides it cited. */
        answer?: string
        sources?: string[]
        /** What the assistant made of it last time: answered, couldn't answer, or a fault on the site. */
        outcome: 'answered' | 'unanswered' | 'site-issue'
        issue?: string
        /**
         * Who may see this entry in the FAQ: the highest audience and any
         * department limit among the guides the assistant was shown, so an
         * answer drawn from a staff or J1 guide is only shown to those readers.
         */
        audience: HelpAudience
        departments?: string[]
        /** J7: always show (pinned) or never show (hidden), and their own wording/answer. */
        pinned?: boolean
        hidden?: boolean
        editedAnswer?: string
        /** The suggestion the assistant raised for J7 from this question, if any. */
        suggestionId?: string
        suggestionKind?: HelpSuggestionKind
        /** The guide that now answers it, once J7 approved one. */
        articleSlug?: string
    }
}
