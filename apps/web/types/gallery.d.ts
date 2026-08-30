import type { ObjectId } from "mongodb"


export { }

declare global {

    interface ScreenshotOfMonth {
        /**
         * The readable filename — always present. For a legacy record it is
         * the literal name of the file under storage/gallery/sotm; for one
         * set through the library picker (see `mediaId`) it is the picked
         * media's own filename, kept purely as a display/download name and
         * as the truthy signal useGalleryData.ts gates the public gallery's
         * SOTM column on. Never assume it names a file under SOTM_DIR — see
         * the branch on `mediaId` in api/gallery/sotm/image/route.ts.
         */
        filename: string
        /** The gallery_media document this points at. Absent only on a
         *  record that predates the library picker. */
        mediaId?: string
        dateTaken: string
        credit: string
        setAt: string
        setBy: string
        operationId?: string
        operationTitle?: string
    }

    /** One tile in the SOTM tab: a library browse candidate or a past
     *  winner. `sotmAt`/`sotmCredit` are null for the former, populated for
     *  the latter. */
    interface SotmMediaTileAPI {
        id: string
        src: string
        caption: string | null
        opLabel: string | null
        sotmAt: string | null
        sotmCredit: string | null
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

    /** One tile of the public featured rail. Ordered by the database, not by
     *  readdir and not shuffled — J5 curates the sequence. */
    interface FeaturedItemAPI {
        id: string
        src: string
        width: number | null
        height: number | null
        caption: string | null
        opLabel: string | null
        /** Readable filename for the lightbox's download attribute — same
         *  role as GalleryItemAPI.file, and needed for the same reason: `src`
         *  is an id-keyed /api/gallery/media/{id} URL with no extension
         *  anywhere in it, so without this every featured download would
         *  save as a bare ObjectId. Null only in the same case GalleryItemAPI
         *  allows it: no storageKey behind the record at all. */
        file: string | null
    }

    interface GalleryAPI {
        info: string
        updated: string
        featured: FeaturedItemAPI[]
        items: GalleryItemAPI[]
        tags: { slug: string, label: string }[]
    }

    /**
     * One media row as the J5 Media tab receives it. Distinct from
     * GalleryItemAPI, which is what the public gallery gets: this one carries
     * the storage key and the on-disk filename, because the tab shows a
     * reviewer exactly where the bytes are, and omits the Wilson score, which
     * only the public sort needs.
     */
    interface AdminMediaAPI {
        id: string
        kind: 'image' | 'video'
        source: 'upload' | 'youtube' | 'twitch'
        src: string | null
        poster: string | null

        /** Embeds only — what tells a reviewer which YouTube/Twitch video a
         *  row is, since an embed has no storageKey and src is always null
         *  for it. Mirrors GalleryItemAPI's fields of the same name. */
        embedId: string | null
        embedKind: 'video' | 'clip' | null
        embedUrl: string | null

        year: string | null
        operation: string | null
        opLabel: string | null
        mission: string | null
        operationId: string | null
        takenAt: string | null

        authorId: string | null
        authorName: string | null
        caption: string | null
        tags: string[]

        width: number | null
        height: number | null
        durationSec: number | null
        bytes: number | null

        /** The full storage key, shown verbatim in the inspector — the
         *  bracketed id in it is the contract that lets a file be moved by
         *  hand, so a reviewer is shown it rather than told about it. */
        storageKey: string | null

        up: number
        down: number
        publishedAt: string | null
    }

    /** The Media tab's left rail: saved views on top, the archive tree below,
     *  every row carrying a live count. */
    interface LibraryFacetsAPI {
        views: { all: number, unknown: number, nocaption: number, videos: number, health: number }
        years: {
            year: string
            /** True when this row is the "field is absent" bucket, as
             *  opposed to a row whose `year` literally is the string
             *  'Unknown' (relocate.ts can write that verbatim, and legacy
             *  documents from parseContentPath's pre-fix behaviour still
             *  hold it). Both display the same label, so this is what lets
             *  the rail send the right filter channel — `yearUnset` for
             *  this row, a literal `year` match for the other — instead of
             *  the two being indistinguishable once both exist. */
            unset: boolean
            count: number
            operations: {
                operation: string
                opLabel: string
                /** Same distinction as `unset` above, one level down. */
                unset: boolean
                count: number
                missions: { mission: string, count: number }[]
            }[]
        }[]
        /** For the filter chips — every tag and author actually in use. */
        tags: { slug: string, label: string, count: number }[]
        authors: { name: string, count: number }[]
    }

}