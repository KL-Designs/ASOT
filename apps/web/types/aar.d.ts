import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * One member's write-up of one operation.
     *
     * Fix / Sustain / Improve rather than free prose, because that is the shape
     * the unit already debriefs in and three narrow boxes get answered where
     * one wide one gets skipped.
     *
     * Its own collection rather than a field on the attendance record: an AAR
     * outlives the roster it came from, is written days after the board stops
     * changing, and is read by people who never open the board. Bolting it onto
     * `records[]` would also mean every roster write rewrote everybody's prose.
     */
    interface OperationAarEntry {
        _id?: ObjectId
        operationId: ObjectId
        /** Whose report this is — not necessarily who typed it. */
        userId: string
        /**
         * The section they were in on the night, denormalised at write time.
         *
         * A copy rather than a lookup because the roster is a snapshot of a
         * night that has already happened and this has to survive it being
         * re-cut, and because "show me Alpha's AARs" should not require
         * reassembling the roster to answer.
         */
        section: string
        fix: string
        sustain: string
        improve: string
        /**
         * Set when somebody other than the member wrote or last edited it —
         * their 1IC, or staff closing the operation out.
         *
         * Recorded rather than hidden: a section commander writing up a member
         * who never filled theirs in is normal and useful, but the member
         * reading it back should be able to see that it is not their own words.
         */
        writtenByUserId: string | null
        writtenByName: string | null
        createdAt: Date
        updatedAt: Date
    }

    /**
     * What one member thought of the night.
     *
     * Separate from the AAR because they answer to different people. An AAR is
     * a section's record of itself, read by its commander; this is the unit's
     * read on the operation, and it is the mission maker's feedback.
     *
     * Each score is 1–5 where **3 is a normal night** — see `RATING_SCALE` in
     * `lib/operations/aar.ts` for why that is a diverging scale rather than a
     * quality one, and why it is not drawn as stars.
     */
    interface OperationFeedback {
        _id?: ObjectId
        operationId: ObjectId
        userId: string
        /** Desync, frame rate, crashes. Null when left unanswered. */
        server: number | null
        /** How engaging the fighting was, and how much of it there was. */
        combat: number | null
        /** Whether the story could be followed, and whether it landed. */
        story: number | null
        /** Anything the three scores could not carry. */
        comment: string
        createdAt: Date
        updatedAt: Date
    }
}
