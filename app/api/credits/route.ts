import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { getOrbatEntriesForUsers } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'

const CONTRIBUTOR_ORDER = ['240786290600181761', '224086573560365057', '683343114865606686']

const THANKS_ORDER = ['166440171447910400', '248743808395640832', '256009348197777409']

const THANKS: Record<string, string> = {
    '166440171447910400': 'Introduced Interactive Maps',
    '248743808395640832': 'Improved API Efficiency.',
    '256009348197777409': 'Significantly Reduced Data Usage.',
}

const CONTRIBUTIONS: Record<string, { title: string; description: string }> = {
    '240786290600181761': {
        title: 'Site Developer',
        description: 'Designed and built the underlying systems and architecture of the ASOT platform - from the operations management tools and ORBAT editor to the collaborative briefing system, milpac pipeline, and the overall site design.',
    },
    '224086573560365057': {
        title: 'Founder & Departments Developer',
        description: 'Creator and owner of ASOT, and the driving force behind the unit itself. Also built the departments dashboard and most of its core functionality, giving leadership the tools they need to effectively manage unit administration.',
    },
    '683343114865606686': {
        title: 'MILPAC Generator',
        description: 'Original creator of the MILPAC system, designing and building the uniform generator, promotion certificates, and award certificates used by the unit.',
    },
}

export type CreditContributor = {
    id: string
    name: string
    rankAbbr: string | null
    fullRank: string | null
    avatarURL: string
    accent: string
    orbatRole: string | null
    orbatSection: string | null
    title: string
    description: string
    awardsCount: number
    promoCount: number
    qualCount: number
}

export type CreditThanks = {
    id: string
    name: string
    rankAbbr: string | null
    avatarURL: string
    accent: string
    reason: string
}

export type CreditsResponse = {
    contributors: CreditContributor[]
    thanks: CreditThanks[]
}

export async function getCreditsData(): Promise<CreditsResponse> {
    const allUsers = await Db.users.find({ _id: { $in: [...CONTRIBUTOR_ORDER, ...THANKS_ORDER] } }).toArray()
    const orbatEntries = await getOrbatEntriesForUsers(CONTRIBUTOR_ORDER)

    const contributors: CreditContributor[] = CONTRIBUTOR_ORDER
        .map(id => {
            const user = allUsers.find(u => u._id === id)
            if (!user) return null

            const orbatEntry = orbatEntries[id] ?? null
            const { name, fullRank, rankAbbr, accent } = resolveMilpacProfile(user as unknown as User, orbatEntry)
            const contrib = CONTRIBUTIONS[id]

            return {
                id,
                name,
                rankAbbr: rankAbbr ?? null,
                fullRank: fullRank ?? null,
                avatarURL: user.avatarURL || '/images/fallback_pfp.png',
                accent,
                orbatRole: orbatEntry?.role ?? null,
                orbatSection: orbatEntry?.section ?? null,
                title: contrib.title,
                description: contrib.description,
                awardsCount:  user.milpac?.awards?.length ?? 0,
                promoCount:   user.milpac?.promotions?.length ?? 0,
                qualCount:    user.milpac?.qualifications?.length ?? 0,
            } satisfies CreditContributor
        })
        .filter((c): c is CreditContributor => c !== null)

    const thanks: CreditThanks[] = THANKS_ORDER
        .map(id => {
            const user = allUsers.find(u => u._id === id)
            if (!user) return null

            const { name, rankAbbr, accent } = resolveMilpacProfile(user as unknown as User, null)

            return {
                id,
                name,
                rankAbbr: rankAbbr ?? null,
                avatarURL: user.avatarURL || '/images/fallback_pfp.png',
                accent,
                reason: THANKS[id],
            } satisfies CreditThanks
        })
        .filter((c): c is CreditThanks => c !== null)

    return { contributors, thanks }
}

export async function GET() {
    return NextResponse.json(await getCreditsData())
}
