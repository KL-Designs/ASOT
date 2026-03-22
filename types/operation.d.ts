import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Operation {
        _id: ObjectId
        
        title: string
        department: string
        date: Date
        loreDate: Date

        content?: any

        fields: {
            title: string

            subfields: {
                content: string
                images: string[]
            }[]
        }[]
    }

}