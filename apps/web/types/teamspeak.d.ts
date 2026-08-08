import type { ObjectId } from 'mongodb'

export { }

declare global {
    interface TsSnapshot {
        _id: ObjectId
        name: string
        auto: boolean       // true = created by daily cron, false = manual
        createdAt: number
        createdBy: string   // userId for manual; 'cron' for auto
        data: string        // raw TS3 snapshot string
        sizeBytes: number
    }
}
