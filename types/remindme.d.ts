import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Reminder {
        _id: ObjectId

        enabled: boolean | null

        expected: Date
        repeat: number

        by: string
        who: string[]

        message: string
        channel: string
    }

}