import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * One comment under an operation's orders.
     *
     * The same shape as a ticket comment where the two overlap (`parentId`,
     * `isEdited`, `isDeleted`), because `lib/comments/thread.ts` lays both out
     * and the orders thread is meant to read exactly like a ticket's. Its own
     * collection rather than a field on the operation: the orders document is
     * rewritten on every autosave of the editor, and a thread that grew inside
     * it would be rewritten with it.
     */
    interface OperationComment {
        _id: ObjectId
        operationId: ObjectId
        authorId: string
        authorName: string
        /** The comment this one answers. Absent on a top-level comment. */
        parentId?: ObjectId | null
        content: string
        /** Set when the author asked for the mission maker to be told — kept so
         *  the thread can show that the question was actually sent to somebody. */
        notifiedMissionMaker?: boolean
        createdAt: Date
        updatedAt?: Date
        isEdited: boolean
        isDeleted: boolean
    }
}
