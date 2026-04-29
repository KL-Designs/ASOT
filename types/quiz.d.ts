declare global {

    type QuizQuestionType = 'text' | 'multiple_choice' | 'image_question'

    interface QuizQuestion {
        id: string
        type: QuizQuestionType
        question: string
        options?: string[]      // multiple_choice only
        correctOption?: number  // multiple_choice only (0-indexed)
        image?: string          // image_question only — key maps to /quiz-images/{key}.png
        answerBoxes?: number    // written/image only — number of answer inputs (default 1); each box = 1 point
    }

    interface QuizSection {
        id: string
        title: string
        questions: QuizQuestion[]
    }

    interface QuizDefinition {
        id: string
        title: string
        timeLimitMinutes: number
        instructions: string[]
        sections: QuizSection[]
        passMarkPoints?: number  // required points to pass (default: derived from quiz)
    }

    type QuizAttemptStatus =
        | 'assigned'      // task created, recruit has not started
        | 'in_progress'   // recruit clicked Start
        | 'submitted'     // recruit submitted, awaiting trainer review
        | 'reviewing'     // trainer is actively reviewing (send_for_review chain)
        | 'passed'
        | 'failed'

    interface QuizAnswer {
        questionId: string
        value: string | null    // text string or selected option text; null = unanswered
        answeredAt?: string     // ISO string
    }

    interface QuizReviewHistoryEntry {
        reviewerId: string
        reviewerName: string
        action: 'sent_for_review' | 'passed' | 'failed'
        notes: string
        timestamp: string       // ISO string
    }

    interface QuizAttempt {
        _id?: import('mongodb').ObjectId
        quizId: string                      // e.g. 'bct-quiz'
        assignmentTaskId: string            // _id of the Task that assigned this quiz
        userId: string                      // recruit's Discord user ID
        userName: string                    // recruit display name at time of assignment
        assignedBy: string                  // J3 trainer Discord user ID
        assignedByName: string
        timeLimitMinutes: number            // may differ from quiz default
        timerModifiedReason?: string        // required if timeLimitMinutes !== quiz default
        startedAt?: Date
        submittedAt?: Date
        timeTakenSeconds?: number
        status: QuizAttemptStatus
        answers: QuizAnswer[]
        currentReviewerId?: string          // who has the ball right now in the review chain
        currentReviewerName?: string
        reviewHistory: QuizReviewHistoryEntry[]
        result?: 'pass' | 'fail'
        createdAt: Date
    }

    // Serialised form returned from API (Dates → ISO strings, ObjectId → string)
    interface QuizAttemptSerialized {
        _id: string
        quizId: string
        assignmentTaskId: string
        userId: string
        userName: string
        assignedBy: string
        assignedByName: string
        timeLimitMinutes: number
        timerModifiedReason?: string
        startedAt?: string
        submittedAt?: string
        timeTakenSeconds?: number
        status: QuizAttemptStatus
        answers: QuizAnswer[]
        currentReviewerId?: string
        currentReviewerName?: string
        reviewHistory: QuizReviewHistoryEntry[]
        result?: 'pass' | 'fail'
        createdAt: string
    }
}

export { }
