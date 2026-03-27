import type { ObjectId } from "mongodb"


export { }

declare global {

    interface OAuth {
        token_type: string
        access_token: string
        expires_in: number
        refresh_token: string
        scope: string
    }

    interface User {
        _id: string
        id: string
        token?: string

        name?: string

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


    interface OAuthUserResponse {
        id: string
        username: string
        avatar: string
        discriminator: string
        public_flags: number
        flags: number
        banner: string
        accent_color: number
        global_name: string
        avatar_decoration_data: null
        banner_color: string
        clan: null
        mfa_enabled: boolean
        locale: string
        premium_type: number
        email: never
        verified: boolean
    }

}