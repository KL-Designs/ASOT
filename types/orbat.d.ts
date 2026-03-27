import type { ObjectId } from 'mongodb'


export { }

declare global {

    // Platoon / HQ / Gamemaster positions — have a named role slot
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

    // Reservist slots — user reference only, no named role or section
    interface ReservistPosition {
        _id: ObjectId
        category: 'activeReservist' | 'inactiveReservist'
        userId: string | null
        positionOrder: number
    }

    interface ReservistPositionWithUser extends ReservistPosition {
        user: {
            id: string
            displayName: string
            avatarURL: string
        } | null
    }

}
