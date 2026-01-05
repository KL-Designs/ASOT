import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Reminder {
        _id: ObjectId

        type: 'single' | 'repeat'
        enabled: boolean | null

        length: number
        expected: Date

        by: string
        who: string[]

        message: string
    }

}