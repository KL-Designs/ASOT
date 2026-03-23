import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Operation {
        _id: ObjectId

        title: string
        department: string
        date: Date
        loreDate: Date
        status?: 'Completed' | 'Active' | 'Upcoming' | 'In Development'

        content?: any
        themeColor?: string
        coverImage?: string

        fields: {
            title: string

            subfields: {
                content: string
                images: string[]
            }[]
        }[]
    }

}