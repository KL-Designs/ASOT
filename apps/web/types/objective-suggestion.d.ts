import type { ObjectId } from 'mongodb'

export { }

declare global {

    /** One confirmed objective idea. See lib/j2/objective-suggestions.ts. */
    interface ObjectiveSuggestion {
        _id: ObjectId
        name: string
        overview: string
        intel: string
        linkedIntel: string
        comments: string
        /** The Objective Idea ticket it was confirmed from, if it came from one. */
        sourceTicketId?: string
        /** Who pitched it — absent when the ticket was anonymous. */
        suggestedByName?: string
        createdAt: Date
        addedById: string
        addedByName: string
        updatedAt: Date
        updatedByName: string
    }

}
