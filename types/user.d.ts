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

        /**
         * The accent the member chose on their own milpac, as `#rrggbb`.
         *
         * Takes priority over `hexAccentColor` everywhere the site paints a
         * member's colour — see `resolveMemberAccent` in
         * `apps/web/lib/military/accent.ts`, which is the only thing that
         * should be reading either of these directly. Absent means "no choice
         * made", and the Discord accent is used instead.
         */
        profileAccent?: string | null

        /** Discord's accent, refreshed on every website login. `#000000` is
         *  what Discord reports for a member who has no accent set at all. */
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

        // Set by apps/bot's processMembers() — when this member's Discord data was last
        // synced, so a mid-run restart can skip members already synced within the interval
        // instead of re-fetching/re-upserting all of them from scratch.
        syncedAt?: number

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
        teamLeadDepts?: string[] // legacy — no longer written; leadership is now a DepartmentRole holding, see departmentRoleIds
        dept2icRoles?: string[]  // legacy — no longer written, same reason
        dept3icRoles?: string[]  // legacy — no longer written, same reason
        departmentRoleIds?: ObjectId[]  // DepartmentRole ids this member holds (sub-roles AND leadership-slot roles; never base roles)
        isChaplain?: boolean

        // IANA zone name (e.g. "Australia/Sydney"); null = not set yet.
        // Set via the /me profile page or the bot's /reminder timezone command.
        timezone?: string | null

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
        tsLinkReminderSentAt?: number  // ms epoch — last time an unlinked-account DM reminder fired, for cooldown

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
                /**
                 * Full rank *name* of the issuing officer (matching `rank` above,
                 * not the abbreviation used by `currentRank`). Signs the rendered
                 * certificate; falls back to the unit signatory when absent, which
                 * is the case for every record predating this field.
                 */
                issuedByRank?: string
            }[]
            awards?: {
                date: string
                name: string
                type: string
                issuedById?: string
                issuedByName?: string
                /** Full rank name of the issuing officer — see promotions above. */
                issuedByRank?: string
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