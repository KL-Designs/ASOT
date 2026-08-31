import type { ObjectId } from "mongodb"
import type { GalleryStatus } from "@/lib/gallery/status"
import type { EmbedProvider, EmbedKind } from "@/lib/gallery/embeds"

export { }

declare global {

    /**
     * One piece of gallery media — the index the gallery reads from.
     *
     * Before this existed the gallery was a window onto a folder tree and
     * `GET /api/gallery` walked it with readdirSync, which is why the page
     * carried no author, no tags and no likes: there was nowhere to put them.
     * Every file in the archive has a document here, written by
     * `scripts/index-gallery.mjs`; the bytes did not move.
     */
    interface GalleryMedia {
        _id: ObjectId

        kind: 'image' | 'video'
        /** Where the bytes are. An embed has none of its own. */
        source: 'upload' | EmbedProvider

        /**
         * Where the bytes are. The prefix names the directory.
         *   'content:{year}/{campaign}/{mission}/{day}/{file}' -> a campaign mission
         *   'content:{year}/{op}/{day}/{file}'      -> a single mission with a day slot
         *   'content:{year}/{op}/{mission}/{file}'  -> storage/gallery/content/...
         *   'content:{year}/{op}/{file}'            -> a published submission, no mission
         *   'content:Unknown/{file}'                -> no operation resolved
         *   'media:{_id}.{ext}'                     -> storage/gallery/media/... (pending only)
         *   'featured:{file}'                       -> storage/gallery/featured/...
         *   'sotm:{file}'                           -> storage/gallery/sotm/...
         * 'legacy:' is the former spelling of 'content:' and still resolves.
         *
         * A file reaches the content tree when it is PUBLISHED, not when it is
         * uploaded: staging/ -> media/ (pending) -> content/ (live). So the
         * readable tree holds only archive material, and a rejected submission
         * never touches it.
         */
        storageKey?: string
        /** 'media:{_id}_poster.jpg'. Uploaded video and embeds; stills have none. */
        posterKey?: string

        /** Embeds only — the provider's own video id or clip slug. */
        embedId?: string
        /** Embeds only. A Twitch VOD and a Twitch clip embed through different
         *  players, so the id alone cannot render one. */
        embedKind?: EmbedKind
        /** Embeds only — the canonical provider URL, for the "watch on" link. */
        embedUrl?: string

        /**
         * The folder-tree facets, one per level of the content path. All
         * present on a migrated item; derived from the chosen operation on a
         * new one, and all absent together when the submitter chose Unknown.
         *
         * `campaign` is the newest and the only optional-by-design one: an
         * operation that belongs to one of J2's campaigns files under the
         * campaign, and `operation` then names the CAMPAIGN MISSION rather than
         * the operation. A single mission and every legacy archive item simply
         * have no campaign, which is why adding the level needed no migration —
         * year -> operation -> mission still describes them exactly.
         *
         * `mission` is `Saturday`/`Sunday` for anything filed under the new
         * grammar (from `Operation.daySlot`), and the legacy archive's own
         * mission folder for everything the migration indexed.
         */
        year?: string
        campaign?: string
        operation?: string
        opLabel?: string
        mission?: string
        operationId?: ObjectId

        /** The operation's date — what the gallery sorts and groups on. Null
         *  when the operation was Unknown and no reviewer has set one. */
        takenAt: Date | null

        /** Absent on migrated files: nothing on disk records who shot what. */
        authorId?: string
        authorName?: string

        caption?: string
        /** `gallery_tags` slugs. */
        tags: string[]

        width?: number
        height?: number
        durationSec?: number
        bytes?: number

        /** Featured rail position. Absent means not featured. */
        featuredOrder?: number
        /** When this became the screenshot of the month. Absent means it never was. */
        sotmAt?: Date
        /** The photographer credit shown with the screenshot of the month, which
         *  is not always the submitting member. */
        sotmCredit?: string

        status: GalleryStatus
        /** Why processing failed. Carried into the review queue rather than
         *  hidden, so a reviewer sees it instead of the item vanishing. */
        processingError?: string
        /** Groups one member's items from one visit to the submit page. */
        batchId?: string

        up: number
        down: number

        createdAt: Date
        publishedAt?: Date
        publishedBy?: string
        rejectedAt?: Date
        rejectedBy?: string
        rejectedReason?: string
    }

    /**
     * One member's vote on one piece of media.
     *
     * The unique index on { mediaId, userId } is what enforces one vote per
     * member. The route does not, and must not be what this relies on.
     */
    interface GalleryVote {
        _id: ObjectId
        mediaId: ObjectId
        userId: string
        value: 1 | -1
        at: Date
    }

    /**
     * The tag vocabulary, managed by J5.
     *
     * Retired rather than deleted, so a rename never has to cascade across
     * every document carrying the slug.
     */
    interface GalleryTag {
        _id: ObjectId
        slug: string
        label: string
        order: number
        retired: boolean
    }

}
