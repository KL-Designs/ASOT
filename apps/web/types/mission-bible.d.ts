import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * One published version of the Mission Making Bible. Versions are never
     * edited or deleted: the change log is a record, and "what did version 4
     * say" has to keep having an answer.
     */
    interface MissionBibleVersion {
        _id: ObjectId
        /** 1, 2, 3… in publishing order. */
        version: number
        /** Sanitised HTML, as the site's editor wrote it. */
        html: string
        /** What changed, in the publisher's words. */
        summary: string
        publishedAt: Date
        publishedById: string
        publishedByName: string
    }

    /** The working copy J2 leads edit between versions. A single document. */
    interface MissionBibleDraft {
        _id: 'draft'
        html: string
        updatedAt: Date
        updatedById: string
        updatedByName: string
    }

}
