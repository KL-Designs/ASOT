interface CheckpointQuestion {
    id: string
    question: string
    type: 'mcq' | 'written'
    options?: string[]
    correctOptionIndex?: number
    rubric?: string
}

interface TrainingVideoCheckpoint {
    id: string
    timestampSeconds: number
    rewindToSeconds: number
    /** Ordered list of questions — user answers each before video resumes */
    questions: CheckpointQuestion[]
    /** @deprecated Legacy single-question fields — kept for migration only */
    question?: string
    type?: 'mcq' | 'written'
    /** MCQ only */
    options?: string[]
    correctOptionIndex?: number
    /** Written only — Claude evaluation rubric */
    rubric?: string
}

interface TrainingVideoCheckpointProgress {
    checkpointId: string
    passed: boolean
    attempts: number
    lastAttemptAt: Date
    /** Set when 3rd-fail notification has been sent to J3 lead */
    notifiedLeadAt?: Date
    /** Set when J3 lead allocates a trainer to confirm knowledge */
    allocatedTrainerId?: string
    allocatedTrainerName?: string
    allocatedAt?: Date
    /** Set when trainer has confirmed the member's knowledge */
    confirmedAt?: Date
    confirmedByName?: string
}

interface TrainingVideoSection {
    id: string
    title: string
    startSeconds: number
    /** Explicit end time; if absent, inferred from next section start or video end */
    endSeconds?: number
}

interface TrainingTypeVideo {
    _id?: import('mongodb').ObjectId
    trainingTypeId: string
    title: string
    /** Served path e.g. /uploads/training-videos/<uuid>.mp4 */
    url: string
    /** Original filename on disk (uuid.ext) */
    filename: string
    description?: string
    /** Total duration in seconds — set after upload/edit */
    duration?: number
    checkpoints: TrainingVideoCheckpoint[]
    sections?: TrainingVideoSection[]
    addedById: string
    addedByName: string
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
    deletedById?: string
}

interface TrainingVideoProgress {
    _id?: import('mongodb').ObjectId
    userId: string
    videoId: string
    trainingTypeId: string
    /** Last known playback position in seconds — for resume */
    lastPositionSeconds: number
    checkpoints: TrainingVideoCheckpointProgress[]
    completed: boolean
    completedAt?: Date
    startedAt: Date
    updatedAt: Date
}
