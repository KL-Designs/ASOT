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

        // Skeleton accounts are created for CSV-imported users not yet matched to Discord
        isSkeletonAccount?: true
        csvName?: string   // name as it appeared in the CSV
        csvRank?: string

        hexAccentColor: string
        accentColor: number
        avatar: string | null
        avatarURL: string
        banner: string | null
        bannerURL: string | null

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

        discharged?: {
            date: string
            type: 'honorable' | 'dishonorable'
            reason: string
            dischargedById: string
            dischargedByName: string
            approvedById: string
            approvedByName: string
        }

        departments?: string[]   // dept codes this user is a member of, e.g. ['j1', 'j3']
        teamLeadDepts?: string[] // dept codes this user is a team lead of, e.g. ['j3']
        isChaplain?: boolean

        teamspeak?: {
            uid: string
            cldbid: number
            nickname: string
            linkedAt: number
        }
        tsVerifyCode?: string
        tsPending?: {
            cldbid: string
            uid: string
            nickname: string
        }

        bio?: {
            content: string
        }

        milpac?: {
            currentRank?: string
            callsign?: string
            enlistedDate?: string
            promotions?: {
                date: string
                rank: string
                role: string
                issuedById?: string
                issuedByName?: string
            }[]
            awards?: {
                date: string
                name: string
                type: string
                issuedById?: string
                issuedByName?: string
            }[]
            operations?: {
                startToEndDate: string
                name: string
            }[]
            qualifications?: {
                date: string
                qualification: string
                issuedById?: string
                issuedByName?: string
            }[]
            promotionPoints?: number
            j4Points?: number
            disciplineDeductions?: number
            disciplineHistory?: {
                date: string
                points: number
                reason: string
                issuedById: string
                issuedByName: string
                approvedById: string
                approvedByName: string
            }[]
            billetCounts?: {
                primaryNightOps: number
                secondaryNightOps: number
                primaryNightFTX: number
                secondaryNightFTX: number
                platoonTraining: number
                sectionTraining: number
                meetings: number
                campaignMedals: number
                j1Interviews: number
                j1InterviewBonus: number
                j2MissionsRun: number
                j3Bct12: number
                j3OtherTrainings: number
                j5ContentCreated: number
                j5MilpacsGenerated: number
                j5OfficialPR: number
            }
            uniformHash?: string   // MD5 of generation inputs; used to detect stale cached portrait
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