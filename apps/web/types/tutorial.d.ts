export {}

declare global {
    /** One member's record of a guided tutorial they have finished. See lib/tutorial/README.md. */
    interface TutorialProgress {
        _id?: import('mongodb').ObjectId
        userId: string
        tutorialId: string
        firstCompletedAt: Date
        lastCompletedAt: Date
        /** Completed runs, replays included. */
        runs: number
    }
}
