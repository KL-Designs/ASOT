import type { ObjectId } from 'mongodb'


export { }

declare global {

    // Platoon / HQ / Gamemaster positions — have a named role slot
    interface OrbatPosition {
        _id: ObjectId
        category: string
        sectionTitle: string
        role: string
        roleId: ObjectId | null
        userId: string | null
        sectionOrder: number
        positionOrder: number
        isSenior?: boolean
        subTitle?: string
    }

    interface OrbatPositionWithUser extends OrbatPosition {
        user: {
            id: string
            username: string
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
            username: string
            displayName: string
            avatarURL: string
        } | null
    }

    // Per-section (and per-category) metadata: patch image + theme color + discord role
    interface OrbatSectionMeta {
        _id: ObjectId
        category: string           // e.g., 'platoon11'
        sectionTitle: string | null // null = category/platoon-level metadata
        patch?: string             // stored filename in ./uploads/orbat/
        color?: string             // hex string e.g., '#c0392b'
        discordRoleId?: string     // Discord role ID for role sync
        tsGroupId?: number         // TeamSpeak server group ID for role sync
    }

}
