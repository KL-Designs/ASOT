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
    }

    interface Role {
        id: string
        name: string
        color: number
        rawPosition: number
    }

}