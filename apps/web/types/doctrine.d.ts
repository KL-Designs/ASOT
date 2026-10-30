import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * Rows 334 and 335: one Enemy Doctrine at one level. Collection `doctrines`.
     *
     * Faction is the reusable base; a campaign doctrine changes it for one
     * campaign; a mission doctrine changes that for one operation. Each stores
     * only its own changes (`overrides`) on top of its parent, so a mission
     * edit cannot write into the campaign or the faction. Published versions
     * are immutable rows in `doctrine_versions`; a historic operation reads
     * the versions that were in force on its date.
     */
    interface Doctrine {
        _id?: ObjectId
        level: 'faction' | 'campaign' | 'mission'
        name: string
        parentId: ObjectId | null
        campaignId?: string | null
        operationId?: string | null
        /** Mission level: the Enemy Doctrine page of the operation it belongs to. */
        pageId?: string | null
        /** This level's unpublished changes on top of its parent. */
        draft: import('@/lib/doctrine/values').DoctrineOverrides
        draftUpdatedAt?: Date | null
        draftByName?: string | null
        /** 0 until first published. */
        publishedVersion: number
        /**
         * The last version a J2 Lead approved (or the first publish).
         * Significance is measured against this, not the last publish, so
         * splitting a large change into small ones still trips the check.
         */
        baselineVersion: number
        /** A significant change waiting for J2 Lead approval. The published version stays live meanwhile. */
        pending?: DoctrinePendingChange | null
        customOptions: import('@/lib/doctrine/schema').DoctrineCustomOption[]
        /** The open J2 Lead review task for this doctrine's custom options. */
        optionsTaskId?: string | null
        createdAt: Date
        createdById: string
        createdByName: string
        deletedAt?: Date | null
    }

    interface DoctrinePendingChange {
        overrides: import('@/lib/doctrine/values').DoctrineOverrides
        reason: string
        reasons: string[]
        changes: import('@/lib/doctrine/values').DoctrineChange[]
        proposedById: string
        proposedByName: string
        proposedAt: Date
        taskId: string | null
    }

    /** One published version of a doctrine level. Collection `doctrine_versions`. */
    interface DoctrineVersion {
        _id?: ObjectId
        doctrineId: ObjectId
        version: number
        overrides: import('@/lib/doctrine/values').DoctrineOverrides
        publishedAt: Date
        publishedById: string
        publishedByName: string
        reason?: string
        approvedById?: string | null
        approvedByName?: string | null
        significant: boolean
    }

    /** A custom option a J2 Lead approved, now offered everywhere. Collection `doctrine_options`. */
    interface DoctrineGlobalOption {
        _id?: ObjectId
        fieldKey: string
        label: string
        description: string
        approvedById: string
        approvedByName: string
        approvedAt: Date
        sourceDoctrineId: string
    }
}
