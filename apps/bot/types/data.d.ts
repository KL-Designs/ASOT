import { ObjectId } from 'mongodb'

export { }

declare global {

    interface StatusData {
        _id: 'status'

        message: string
        channel: string
    }

    interface SyncStateData {
        _id: 'membersLastSynced'

        timestamp: number
    }

}