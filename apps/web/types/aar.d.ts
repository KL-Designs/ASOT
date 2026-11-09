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
        /** Row 328 (Q7): how much the member enjoyed the night overall. */
        enjoyment?: number | null
        /** Anything the three scores could not carry. */
        comment: string
        createdAt: Date
        updatedAt: Date
    }

    /**
     * Row 328: a section's shared Mission AAR block for one operation, written
     * together by its staff when the mission maker switches it on. One per
     * section per operation, collection `operation_mission_aars`. Mongo is the
     * authority; the live document `maar-{operationId}` only carries a revision
     * and who is looking, the same split the attendance board uses.
     */
    interface OperationMissionAar {
        _id?: ObjectId
        operationId: ObjectId
        section: string
        situation: string
        /** Missing in action or captured, as free text: names, last seen, circumstances. */
        missingCaptured: string
        /** A list rather than prose, so it can carry into the campaign's next mission later. */
        vehicles: { name: string; status: string; note: string }[]
        updatedAt: Date
        updatedById: string
        updatedByName: string
    }

    /**
     * Row 330: one commendation written on an operation's AAR, for a member or
     * a whole call sign. Rolled up Call Sign → PHQ → CHQ in AAR Reports and
     * never summarised by AI. Collection `operation_commendations`.
     */
    interface OperationCommendation {
        _id?: ObjectId
        operationId: ObjectId
        authorId: string
        authorName: string
        /** The section the author wrote it from; empty for staff outside the roster. */
        authorSection: string
        targetType: 'member' | 'callsign'
        targetUserId?: string
        /** The member's name or the call sign, as shown. */
        targetName: string
        wording: string
        createdAt: Date
    }

    /**
     * Row 329: a cached AI summary of AAR entries for one scope and level.
     * Collection `aar_summaries`. Regenerated when `sourceHash` no longer
     * matches the entries it was made from; the raw entries are never changed.
     */
    interface AarSummary {
        _id: string
        scope: string
        level: string
        unit: string
        sourceIds: string[]
        sourceHash: string
        summary: string
        generatedAt: Date
        generatedById: string
        generatedByName: string
    }
}
