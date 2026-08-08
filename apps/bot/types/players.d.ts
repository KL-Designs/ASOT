import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Player {
        _id: ObjectId
        
        rank: number
        points: number
    }

}