import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Reminder {
        _id: ObjectId

        enabled: boolean | null

        expected: Date
        acknowledged: string[] | true | null
        nextCheck: Date | null
        chaseUpOffset: number | null
        repeat: number

        by: string
        who: string[]

        message: string
        channel: string
        messageId: string | null
    }

}