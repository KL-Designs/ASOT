export {}

declare global {
    interface RecruitVideoConfig {
        _id: string
        videoUrl: string
        enabled: boolean
        startDelay: number   // seconds before autoplay fires, default 2
        /** When true, video → info page → application. When false, video → application directly. */
        showInfoPage: boolean
        updatedAt: Date
        updatedByName: string
    }

    interface RecruitVideoExitEvent {
        at: Date
        atPct: number
        type: 'visibilitychange' | 'beforeunload'
    }

    interface RecruitVideoProgress {
        _id?: import('mongodb').ObjectId
        sessionKey: string
        videoUrl: string
        startedAt: Date
        updatedAt: Date
        maxReachedPct: number
        totalWatchSeconds: number
        completed: boolean
        completedAt?: Date
        continueClickedAt?: Date
        continueClickedAtPct?: number
        exitEvents: RecruitVideoExitEvent[]
        userAgent?: string
    }
}
