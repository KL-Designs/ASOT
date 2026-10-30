export { }

declare global {

    /**
     * Row 384: whether a member wants physical awards posted to them. One per
     * member, collection `award_postage_prefs`. Only the answer and its
     * timings are kept: names, addresses, PO boxes and case colours are sent
     * to LT GEN Thomas directly and never reach the site.
     */
    type AwardPostagePreference = 'yes' | 'no' | 'unassigned'

    interface AwardPostagePref {
        _id?: import('mongodb').ObjectId
        userId: string
        userName: string
        preference: AwardPostagePreference
        /** When the first preference DM went out. */
        firstAskedAt?: Date
        lastReminderAt?: Date
        /**
         * When the next preference DM is due, while Unassigned with awards
         * waiting. A few minutes out for a new award, so awards given together
         * go in one message; two weeks out after each DM.
         */
        nextReminderAt?: Date | null
        reminderCount?: number
        answeredAt?: Date
        /** 'member' for a Discord button press, otherwise the Discord id of whoever set it. */
        answeredBy?: string
        updatedAt: Date
    }

    /**
     * Status of one award waiting to be posted. "Carried over" is not a status:
     * it is `carriedFrom` being set on a queued or awaiting item.
     */
    type AwardPostageStatus = 'awaiting_preference' | 'ready' | 'sent' | 'declined'

    /** One physical award to post. Collection `award_postage_items`. */
    interface AwardPostageItem {
        _id?: import('mongodb').ObjectId
        userId: string
        userName: string
        /** The `milpac.awards[]` entry it came from; awards have no id of their own. */
        awardName: string
        awardType: string
        awardDate: string
        /** 'YYYY-MM' of the list it currently sits in. */
        month: string
        /** 'YYYY-MM' of the list it was first queued in, once it has been carried. */
        carriedFrom?: string
        status: AwardPostageStatus
        createdAt: Date
        sentAt?: Date
        sentById?: string
        sentByName?: string
    }

    /** Row 384 settings: one document in `site_settings` (`_id: 'awardPostage'`). */
    interface AwardPostageConfig {
        _id: 'awardPostage'
        dmTitle: string
        /** Placeholders: {name}, {awards}. */
        dmBody: string
        /** The case colours picture. */
        imageUrl?: string
        /** Campaign Medallions are excluded unless this is on (Q10). */
        includeCampaignMedals: boolean
        updatedAt?: Date
        updatedByName?: string
    }
}
