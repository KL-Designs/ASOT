import { ObjectId } from 'mongodb'

export { }

declare global {

    interface GuildMember {
        _id: string
        avatar: string | null
        banner: string | null
        communication_disabled_until: number | null
        flags: number
        joined_at: string
        nick: string | null
        pending: boolean
        premium_since: string | null
        unusual_dm_activity_until: number | null
        mute: boolean
        deaf: boolean
        user: {
            id: string
            username: string
            avatar: string
            discriminator: string
            public_flags: number
            flags: number
            banner: string
            accent_color: number
            global_name: string
            avatar_decoration_data: any
            banner_color: string
            clan: any
        },
        roles: string[]
    }

}