import type { ObjectId } from 'mongodb'

export {}

declare global {
    /**
     * A member's imported ACE arsenal loadout.
     *
     * Only `raw` is stored. Parsing happens at render, so improving the parser
     * or the name dictionary improves every existing row with no migration.
     *
     * Web-only, so it lives here rather than in the monorepo-root types/ —
     * User is shared with apps/bot and has no business carrying this.
     */
    interface MemberLoadout {
        _id: ObjectId
        /** Discord id, as every other member-scoped collection keys on. */
        userId: string
        name: string
        /** A line on what the kit is for. Optional; shown on the unit's shelf. */
        description?: string
        /** A `KitIconKey` from lib/loadout/kit-icons. Absent/unknown renders the default. */
        icon?: string
        isDefault: boolean
        /**
         * Opt-in publication. A shared ("public") kit appears on the owner's
         * milpac and on /community/kits for anyone to copy; an unshared one is
         * only ever sent to the owner's own browser. This is the whole privacy
         * boundary for the collection — every read of another member's kits
         * must filter on it.
         */
        shared: boolean
        /**
         * Keys from `lib/loadout/tags.ts`. Typed `string[]` rather than
         * `KitTag[]` because a `.d.ts` cannot import; every write goes through
         * `normaliseTags`, and every read tolerates a key the vocabulary has
         * since dropped.
         */
        tags?: string[]
        /**
         * Denormalised from `loadout_ratings` on every rating. The shelf sorts
         * on these, and a lookup per card is what they exist to avoid — the
         * same reasoning as `voteScore` on a community ticket.
         */
        ratingAvg?: number
        ratingCount?: number
        /**
         * The running total `ratingAvg` is divided from. Exists so the average
         * can be maintained by atomic delta — `$inc`-style, inside the same
         * aggregation-pipeline update that applies the delta — rather than
         * recomputed from a snapshot read a moment earlier. Optional, absent on
         * existing documents, reads default to 0.
         */
        ratingSum?: number
        /** Distinct actors who have copied it — see `loadout_copies`. */
        copyCount?: number
        /** The ACE arsenal export as pasted, whitespace-trimmed. The source of truth. */
        raw: string
        createdAt: Date
        updatedAt: Date
    }

    /**
     * One member's rating of one kit. A collection rather than an array on the
     * loadout for two reasons: a rating carries a value per user, not just
     * membership; and the shelf sends each loadout document's `raw` to the
     * browser, so keeping ratings anonymous would otherwise depend on every
     * future projection remembering to exclude the raters. Here there is no
     * field to leak.
     *
     * Unique on `{ loadoutId, userId }` — that index *is* the
     * one-rating-per-member rule.
     */
    interface LoadoutRating {
        _id: ObjectId
        loadoutId: ObjectId
        /** Discord id. Always a member — anonymous visitors cannot rate. */
        userId: string
        stars: 1 | 2 | 3 | 4 | 5
        createdAt: Date
        updatedAt: Date
    }

    /**
     * One actor's copies of one kit. `MemberLoadout.copyCount` counts documents
     * here, not the `copies` field — the headline number is how many people
     * took the kit, not how many times.
     *
     * Unique on `{ loadoutId, actorId }`.
     */
    interface LoadoutCopy {
        _id: ObjectId
        loadoutId: ObjectId
        /** A Discord id, or `anon:<uuid>` for a signed-out visitor. */
        actorId: string
        /** Repeat copies by the same actor. Recorded, but nothing reads it. */
        copies: number
        firstCopiedAt: Date
        lastCopiedAt: Date
    }
}
