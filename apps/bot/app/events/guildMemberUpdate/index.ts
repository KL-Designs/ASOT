import Discord from 'discord.js'
import { processMember } from '../../processMembers.ts'



export default async function (oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {
    const rolesChanged = !oldMember.roles.cache.equals(newMember.roles.cache)
    if (!rolesChanged) return

    await processMember(newMember)
}