import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Reminder {
        _id: ObjectId

        enabled: boolean | null

        expected: Date
        acknowledged: number | true | null
        nextCheck: Date | null
        repeat: number

        by: string
        who: string[]

        message: string
        channel: string
    }

}