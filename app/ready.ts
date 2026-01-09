import App from 'app'
import Db from 'lib/mongo.ts'
import fs from 'node:fs'

import Discord from 'discord.js'
import Commands from 'discord/commands'

import processRoles from "./processRoles.ts"
import processMembers from "./processMembers.ts"

import Dig from './commands/stats/dig.ts'



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


    async function updateStatus() {
        try {
            const status = await Db.data.findOne({ _id: 'status' })
            const guild = await App.guild()
            const channel = await guild.channels.fetch(status.channel) as Discord.TextBasedChannel
            const message = await channel.messages.fetch(status.message)

            const result = await Dig()
            message.edit(result).catch(() => console.warn('Message no longer exists'))
        }
        catch { }
    }
    
    
    setInterval(updateStatus, 1000 * 60 * 5), updateStatus()
    setInterval(processRoles, 1000 * 60 * 60), processRoles()
    setInterval(processMembers, 1000 * 60 * 60), processMembers()
}