import App from 'app'
import Db from 'lib/mongo.ts'
import Discord from 'discord.js'


export async function processMember(member: Discord.GuildMember) {
    const user = await member.user.fetch()
    const userJson = user.toJSON()
    userJson['guild'] = member.toJSON()

    await Db.users.updateOne(
        { _id: user.id },
        { $set: userJson },
        { upsert: true }
    )

    console.log(`Processed member: ${user.tag}`)
}

export default async function processMembers() {
    const guild = await App.guild()
    await guild.members.fetch()
    const members = guild.members.cache

    const batchSize = 10
    const delay = ms => new Promise(res => setTimeout(res, ms))

    const allMembers = Array.from(members.values())

    for (let i = 0; i < allMembers.length; i += batchSize) {
        const batch = allMembers.slice(i, i + batchSize)
        await Promise.allSettled(batch.map(m => processMember(m)))
        console.log(`Processed ${i + batch.length}/${allMembers.length} members`)
        await delay(2000)
    }
}