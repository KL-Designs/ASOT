import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Optional {
        _id: 'qol' | 'gfx' | 'zeus'
        
        mods: {
            id: string
            name: string
        }[]
    }

}