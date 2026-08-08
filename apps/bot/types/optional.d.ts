import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Optional {
        _id: 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5'

        mods: {
            id: string
            name: string
        }[]
    }

}