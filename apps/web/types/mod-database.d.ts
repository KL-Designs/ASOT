import type { ObjectId } from 'mongodb'

export { }

declare global {

    /** One mod the unit has looked at. See lib/mods/mod-database.ts. */
    interface ModEntry {
        _id: ObjectId
        name: string
        workshopUrl: string | null
        /** `workshopUrl`, normalised — for spotting a mod that is already listed. */
        urlKey?: string
        status: 'approved' | 'testing' | 'known_issues' | 'rejected'
        /** Known issues, test notes, why it was rejected. */
        notes: string
        testedByName: string
        /** `YYYY-MM-DD`, or '' when no test is recorded. */
        testedOn: string
        /** The mod-request ticket this entry was made from, if it was. */
        sourceTicketId?: string
        createdAt: Date
        createdById: string
        createdByName: string
        updatedAt: Date
        updatedByName: string
    }

}
