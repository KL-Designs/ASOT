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
        isDefault: boolean
        /** Opt-in: may other members copy the export string? */
        shared: boolean
        /** The ACE arsenal export as pasted, whitespace-trimmed. The source of truth. */
        raw: string
        createdAt: Date
        updatedAt: Date
    }
}
