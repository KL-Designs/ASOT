import App from 'app'
import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'
import Db from 'lib/mongo.ts'
import dig from './dig.ts'


export default {
    name: 'stats',
    description: 'Add Server Status Embed',
    type: ApplicationCommandType.ChatInput,

    async execute(interaction) {

        const status = await Db.data.findOne({ _id: 'status' })
        const guild = await App.guild()

        try {
            const channel = await guild.channels.fetch(status.channel) as Discord.TextBasedChannel
            const message = await channel.messages.fetch(status.message)
            message.delete()
        } catch { }

        const msg = await interaction.channel.send('Prepping Status Embed...')
        Db.data.updateOne({ _id: 'status' }, { $set: { message: msg.id, channel: msg.channelId }, $setOnInsert: { _id: 'status' } }, { upsert: true })

        interaction.deferReply().then(() => interaction.deleteReply())

        const result = await dig()
        msg.edit(result)
        
    }
} as ChatCommand