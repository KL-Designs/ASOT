import App from 'app'
import Db from 'lib/mongo.ts'
import config from 'config'
import fs from 'node:fs'

import Discord from 'discord.js'
import Commands from 'discord/commands'

import { NumberWithCommas } from 'lib/util.ts'



export default async function (client: Discord.Client) {

    console.info(`App Logged in as ${client.user?.tag}`)

    await App.client.application?.commands.set(Commands).then(() => {
        console.table(
            Commands.map(c => ({
                name: c.name,
                description: c.description,
                subcommands: c.options?.map(o => o.name).join(', ') || 'N/A',
                dmPermission: c.dmPermission,
                type: c.type === Discord.ApplicationCommandType.ChatInput ? 'Chat Input' : c.type === Discord.ApplicationCommandType.User ? 'User Context' : 'Unknown'
            }))
        )

        fs.writeFileSync('./commands.json', JSON.stringify(Commands, null, '\t'))
    })


    async function processRoles() {
        const guild = await App.guild()
        guild.roles.cache.forEach(r => {
            Db.roles.updateOne({ id: r.id }, { $set: { _id: r.id, ...r.toJSON() as Role } }, { upsert: true })
        })
    }
    setInterval(processRoles, 1000 * 60 * 60), processRoles()


    async function processMembers() {
        const guild = await App.guild()
        await guild.members.fetch()
        const members = guild.members.cache.filter(m => m.roles.cache.has('1110471500563239012'))

        const batchSize = 10
        const delay = ms => new Promise(res => setTimeout(res, ms))

        const allMembers = Array.from(members.values())

        for (let i = 0; i < allMembers.length; i += batchSize) {
            const batch = allMembers.slice(i, i + batchSize)

            // Fetch user info concurrently, but only for this batch
            const users = await Promise.allSettled(batch.map(m => m.user.fetch()))

            // Save to DB
            for (const result of users) {
                if (result.status === 'fulfilled') {
                    const user = result.value
                    let userJson = user.toJSON()
                    userJson['guild'] = guild.members.cache.get(user.id).toJSON()

                    await Db.users.updateOne(
                        { _id: user.id },
                        { $set: userJson },
                        { upsert: true }
                    )
                }
            }

            console.log(`Processed ${i + batch.length}/${allMembers.length} members`)
            await delay(2000)
        }
    }
    setInterval(processMembers, 1000 * 60 * 60), processMembers()

}