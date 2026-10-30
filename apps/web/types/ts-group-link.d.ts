import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * "This rank / award / campaign / certification is that TeamSpeak group."
     *
     * Most of these never need a row: `lib/teamspeak/tags.ts` already names the
     * group for every rank, award, certification and past campaign, and the
     * sync finds it on the server by name. A row exists for what the table does
     * not know — a new campaign, a group that was renamed — and wins over the
     * name match. One row per (kind, key). See lib/teamspeak/milpac-groups.ts.
     */
    interface TsGroupLink {
        _id: ObjectId
        kind: 'rank' | 'award' | 'campaign' | 'certification'
        /** Rank abbreviation, award label, campaign name or certification label. */
        key: string
        /** `key`, normalised — what the unique index and lookups use. */
        keyNorm: string
        tsGroupId: number
        updatedAt: Date
        updatedBy: string
        updatedByName: string
    }

}
