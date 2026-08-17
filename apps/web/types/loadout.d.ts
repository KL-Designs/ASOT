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
        /** The ACE arsenal export as pasted, whitespace-trimmed. The source of truth. */
        raw: string
        createdAt: Date
        updatedAt: Date
    }
}
