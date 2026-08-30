import type { ObjectId } from "mongodb"


export { }

declare global {

    interface ScreenshotOfMonth {
        filename: string
        dateTaken: string
        credit: string
        setAt: string
        setBy: string
        operationId?: string
        operationTitle?: string
    }

    /** One piece of media, as the gallery page receives it. Everything is
     *  JSON-safe — dates are ISO strings, ObjectIds are hex. */
    interface GalleryItemAPI {
        id: string
        kind: 'image' | 'video'
        source: 'upload' | 'youtube' | 'twitch'

        /** Ready to use. Legacy items get an /api/gallery/fetch URL, new ones
         *  an /api/gallery/media URL — the page never has to know which. */
        src: string | null
        poster: string | null

        embedId: string | null
        embedKind: 'video' | 'clip' | null
        embedUrl: string | null

        year: string | null
        operation: string | null
        opLabel: string | null
        /** MAX_SAFE_INTEGER when the folder carried no ordering prefix. */
        opOrder: number
        mission: string | null
        takenAt: string | null

        authorId: string | null
        authorName: string | null
        caption: string | null
        tags: string[]

        width: number | null
        height: number | null
        durationSec: number | null

        up: number
        down: number
        /** Wilson lower bound, precomputed so the client never recomputes it
         *  for four thousand items on every sort. */
        score: number

        /** ISO. Null on migrated legacy files — see lib/gallery/freshness.ts. */
        publishedAt: string | null

        /**
         * The item's readable name on disk, for a download's filename.
         *
         * Every archive item is `content:`-keyed and served from
         * `/api/gallery/media/{id}`, so there is nothing in the URL for the
         * client to derive a name from — before this, all 4,781 downloads
         * saved as a bare ObjectId with no extension. The name the feature
         * spent nine tasks putting on disk is simply sent.
         *
         * Null only for an embed, which has no bytes and no file.
         */
        file: string | null
    }

    interface GalleryAPI {
        info: string
        updated: string
        featured: string[]
        items: GalleryItemAPI[]
        tags: { slug: string, label: string }[]
    }

}