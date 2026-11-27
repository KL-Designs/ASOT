import { ObjectId } from 'mongodb'

export { }

/**
 * The ASOT Mod and Features wiki: in-game mod guides editable by J7 and J4,
 * viewable by all dashboard members. See `lib/mod-wiki/` for how the pieces fit.
 */
declare global {

    type ModWikiCategory =
        | 'cbrn'
        | 'airborne'
        | 'systems'
        | 'mrh-tools'
        | 'echo'
        | 'weapons'
        | 'special-equipment'
        | 'vehicles'
        | 'training-targets'
        | 'enhancement-addons'
        | 'gear'
        | 'misc'
        | 'tsp'
        | 'medical-simulator'
        | 'hebontes'
        | 'mission-template'

    /**
     * One mod-wiki article. The built-in starter articles live in
     * `lib/mod-wiki/articles.ts`; a document in `mod_wiki_articles` with the
     * same slug replaces one, and one with a new slug adds to them.
     */
    interface ModWikiArticle {
        /** URL slug — `/dashboard/unit/mod-features/{slug}`. */
        _id: string
        title: string
        category: ModWikiCategory
        /** One line, shown in lists and search results. */
        summary: string
        /** GFM Markdown. Images use absolute paths: `/mod-wiki/{category}/{file}`. */
        body: string
        /** Which PBOs or packages this guide covers, e.g. ["ASOT_CBRN"]. */
        pbos: string[]
        /** Required mods shown at the top of the article. */
        requiredMods: string[]
        /** Version string shown at the top of the article, e.g. "Build G7 · November 2026". */
        version?: string
        keywords: string[]
        order?: number
        hidden?: boolean
        /** Bumped on every saved change. Built-in articles start at 0. */
        version_num: number
        updatedAt?: Date
        updatedById?: string
        updatedByName?: string
    }

    type ModWikiSuggestionKind = 'edit' | 'new' | 'bug'
    type ModWikiSuggestionStatus = 'pending' | 'approved' | 'rejected'

    /** Something a reader sent in from a mod-wiki article page. */
    interface ModWikiSuggestion {
        _id?: ObjectId
        kind: ModWikiSuggestionKind
        /** The article it is about. Required for `edit`; optional for `new`/`bug`. */
        articleSlug?: string
        /** The article's version when the edit was written. */
        baseVersion?: number
        /** `edit`/`new`: proposed title. `bug`: short headline. */
        title: string
        /** `edit`/`new`: proposed body. `bug`: description. */
        body: string
        /** `new`: the proposed summary. */
        summary?: string
        category?: ModWikiCategory
        /** Why the edit is needed. */
        note?: string
        status: ModWikiSuggestionStatus
        authorId: string
        authorName: string
        createdAt: Date
        reviewedById?: string
        reviewedByName?: string
        reviewedAt?: Date
        reviewNote?: string
    }

    /** A copy of a mod-wiki article before a change, for history and restore. */
    interface ModWikiRevision {
        _id?: ObjectId
        slug: string
        version_num: number
        title: string
        summary: string
        body: string
        category: ModWikiCategory
        pbos: string[]
        requiredMods: string[]
        version?: string
        keywords: string[]
        order?: number
        hidden?: boolean
        savedAt: Date
        savedById?: string
        savedByName?: string
        reason: 'edit' | 'suggestion' | 'restore'
        suggestionId?: string
    }
}
