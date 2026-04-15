import App from 'app'
import Discord from 'discord.js'
import { processMember } from '../../processMembers.ts'



export default async function (member: Discord.GuildMember) {
    await processMember(member)
}