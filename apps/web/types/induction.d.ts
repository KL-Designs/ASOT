export { }

declare global {

    /**
     * Row 212: the Discord post in the Want to Join channel counting down to
     * the next Selection's Session 1. One document in `site_settings`
     * (`_id: 'selectionCountdown'`), edited from J3 → Admin.
     *
     * The date is never stored here: it is read from the course instances on
     * every sync (`lib/training/find-next-selection.ts`). Only a manual override
     * is kept, for the rare intake that is announced before its course exists.
     */
    interface SelectionCountdownConfig {
        _id: 'selectionCountdown'
        enabled: boolean
        /** The Want to Join channel. Falls back to DISCORD_WANT_TO_JOIN_CHANNEL_ID. */
        channelId?: string
        title: string
        /** Body text. `{date}` becomes the Discord timestamp line, or "To be confirmed". */
        text: string
        imageUrl?: string
        /** Shown instead of the calculated date while it is in the future. */
        overrideAt?: Date | null
        /** The post being kept up to date, so edits never create a second one. */
        messageId?: string
        postedChannelId?: string
        /** What was last sent, so an unchanged post is not edited every tick. */
        postedFingerprint?: string
        postedAt?: Date
        lastError?: string
        updatedAt?: Date
        updatedByName?: string
    }

    /** One page of the website Member Induction (rows 213, 348 to 350). */
    interface InductionStep {
        id: string
        title: string
        /** Plain text; blank lines separate paragraphs. */
        body: string
        links?: { label: string; url: string }[]
    }

    /**
     * Row 213: what J1 sends a new member, and the website induction it links
     * to. One document in `site_settings` (`_id: 'inductionPack'`), edited from
     * J1 → Admin → Induction Pack. Steps are data, so more can be added later
     * without code changes.
     */
    interface InductionPackConfig {
        _id: 'inductionPack'
        dmTitle: string
        /** Placeholders: {name}, {selectionDate}, {inductionUrl}, {selectionUrl}, {calendarUrl}. */
        dmBody: string
        welcomeText: string
        imageUrl?: string
        links: { label: string; url: string }[]
        selectionText: string
        calendarUrl: string
        steps: InductionStep[]
        updatedAt?: Date
        updatedByName?: string
    }

    /** One new member's way through the induction. Collection `induction_progress`, one per member. */
    interface InductionProgress {
        _id?: import('mongodb').ObjectId
        userId: string
        userName: string
        applicationId?: string
        /** Unset when the member opened the induction without being sent the pack. */
        sentAt?: Date
        sentById?: string
        sentByName?: string
        /** How many times the pack has been sent; a resend keeps the progress. */
        sendCount?: number
        openedAt?: Date
        stepsDone: string[]
        completedAt?: Date
        selectionInterest?: { at: Date; instanceId?: string; instanceRef?: string }
    }
}
