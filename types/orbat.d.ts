import type { ObjectId } from 'mongodb'


export { }

declare global {

    interface OrbatCategory {
        _id: string   // category key, e.g. 'platoon11'
        label: string
        order: number
    }

    interface OrbatPosition {
        _id: ObjectId
        category: string
        sectionTitle: string
        role: string
        userId: string | null
        sectionOrder: number
        positionOrder: number
        isSenior?: boolean
        subTitle?: string
    }

    interface OrbatPositionWithUser extends OrbatPosition {
        user: {
            id: string
            displayName: string
            avatarURL: string
        } | null
    }

}
