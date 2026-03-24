import { ObjectId } from 'mongodb'

export { }

declare global {

    interface OperationSection {
        id: string
        title: string
        isPublic: boolean
        content?: any  // ProseMirror JSON
    }

    interface Operation {
        _id: ObjectId

        title: string
        department: string
        date: Date
        loreDate: Date
        status?: 'Completed' | 'Active' | 'Upcoming' | 'In Development'

        sections?: OperationSection[]
        content?: any  // legacy single-body field
        themeColor?: string
        pageTheme?: 'modern' | 'oldfashioned' | 'scifi'
        coverImage?: string

        yjsState?: Buffer

        fields: {
            title: string

            subfields: {
                content: string
                images: string[]
            }[]
        }[]
    }

}
