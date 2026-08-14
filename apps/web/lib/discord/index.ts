import { cookies } from 'next/headers'
import { GenerateToken } from '@/lib/encryption'
import Db from '@/lib/mongo'
import { botRequest } from '@/lib/discord/bot'

// Guild-scoped helper — wraps botRequest for /guilds/:id/... endpoints
function guildRequest<T = unknown>(route: string, route2?: string): Promise<T> {
    const path = `/guilds/${process.env.DISCORD_GUILD_ID}/${route}${route2 ? `/${route2}` : ''}`
    return botRequest<T>('GET', path)
}


export interface IClient {
    roles: Role[]
}

interface Member extends User {
    roles: Role[]
    hasRoles?: (check: string[]) => boolean
}



export class Client implements IClient {

    roles: IClient['roles']
    // Resolves once `roles` is actually populated — awaited at the top of
    // fetchMember() (see below) so every caller of fetchMe()/fetchMember()
    // is guaranteed a non-stale `this.roles` before it can read it, without
    // hasRoles() itself needing to become async (it stays synchronous and
    // untouched — see fetchMember() for why that matters).
    private rolesReady: Promise<void>


    constructor() {
        this.roles = []
        this.rolesReady = this.updateRoles()
    }


    async updateRoles() {
        this.roles = await Db.roles.find({}).toArray()
    }


    async fetchMe(token?: string): Promise<Member> {
        if (!token) {
            const cookieStore = await cookies()

            token = cookieStore.get('token')?.value
            if (!token) throw new Error('No token found')
        }

        const member = await this.fetchMember(token)
        if (!member) throw new Error('Invalid token')

        return member
    }

    async fetchMember(identifier: string, rolesEnabled?: boolean): Promise<Member> {
        // Both this method's own `this.roles` read below and every caller's
        // subsequent hasRoles()/PERMISSIONS check need roles to already be
        // loaded — this is the one place that guarantee actually needs to
        // be enforced, since fetchMe()/fetchMember() is awaited before any
        // of the ~300 call sites elsewhere ever touch roles at all.
        await this.rolesReady

        const user = await Db.users.findOne({ $or: [{ _id: identifier }, { token: identifier }] })
        if (!user) throw new Error('User not found, please try again later.')
        if (user.discharged) throw new Error('Account has been discharged.')

        if (!user.token) {
            user.token = GenerateToken()
            await Db.users.updateOne({ _id: user._id }, { $set: user })
        }

        const roles = this.roles.filter(r => user.guild.roles.includes(r.id))

        return {
            ...user,
            roles,
            hasRoles: rolesEnabled ? (check: string[]) => this.hasRoles(user, check) : undefined
        }
    }

    async fetchAllMembers(): Promise<User[]> {
        const members: User[] = await Db.users.find({}).toArray()
        return members
    }

    buildOrbatLookup(members: User[]): (orbatName: string) => User | null {
        const stripDecorations = (s: string) =>
            s.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim()

        const byName = new Map<string, User>()
        for (const member of members) {
            const nick = member.guild?.nickname ? stripDecorations(member.guild.nickname) : null
            const key = (member.name || nick || member.globalName || '').toLowerCase()
            if (key) byName.set(key, member)
        }

        return function lookup(orbatName: string): User | null {
            const key = stripDecorations(orbatName).toLowerCase()
            if (byName.has(key)) return byName.get(key)!
            // Fallback: Discord nickname may have trailing plain-text status (e.g. "LOA", "AWOL")
            for (const [discordKey, member] of byName) {
                if (discordKey.startsWith(key + ' ')) return member
            }
            // Fallback: rank prefix differs between sheet and Discord (e.g. "SAM" vs "SSAM")
            const orbatSuffix = key.includes(' ') ? key.slice(key.indexOf(' ') + 1) : ''
            if (orbatSuffix) {
                for (const [discordKey, member] of byName) {
                    const discordSuffix = discordKey.includes(' ') ? discordKey.slice(discordKey.indexOf(' ') + 1) : ''
                    if (discordKey === orbatSuffix || discordSuffix === orbatSuffix || discordSuffix.startsWith(orbatSuffix + ' ')) return member
                }
            }
            return null
        }
    }


    hasRoles(member: User, check: string[]): boolean {
        const override = process.env.OVERRIDE?.split(',') || []
        if (override.includes(member.id)) return true

        const roles = this.roles.filter(r => member.guild.roles.includes(r.id))

        if (roles.some(r => r.name === 'J4-Administration')) return true
        return roles.some(r => check.includes(r.name))
    }

    fetchRole(identifier: string): Role {
        const index = this.roles.findIndex(r => r.id === identifier || r.name === identifier)
        if (index === -1) throw new Error('Role not found')
        const role = this.roles[index]

        return role
    }

}


const client = new Client()

export default client