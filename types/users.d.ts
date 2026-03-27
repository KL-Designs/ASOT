import { ObjectId } from 'mongodb'

export { }

declare global {

    interface GuildMember {
        _id: string
        id: string
        token?: string

        hexAccentColor: string
        accentColor: number
        avatar: string
        avatarURL: string
        banner: string
        bannerURL: string

        globalName: string
        tag: string
        username: string

        guild: {
            nickname: string
            avatar: string
            avatarURL: string
            displayName: string
            joinedTimestamp: number
            roles: string[]
        }

        optionals?: {
            qol: { id: string, name: string }[]
            gfx: { id: string, name: string }[]
            zeus: { id: string, name: string }[]
            j2: { id: string, name: string }[]
            j5: { id: string, name: string }[]
        }

        bio?: {
            content: string
            name: string
            rank: string
            callsign: string
        }

        milpac?: {
            currentRank?: string
            enlistedDate?: string
            promotions?: {
                date: string
                rank: string
                role: string
            }[]
            awards?: {
                date: string
                name: string
                type: string
            }[]
            operations?: {
                startToEndDate: string
                name: string
            }[]
            qualifications?: {
                date: string
                qualification: string
                trainer: string
            }[]
        }
    }

    interface Role {
        id: string
        name: string
        color: number
        rawPosition: number
    }

}