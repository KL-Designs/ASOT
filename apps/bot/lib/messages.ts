import Discord from 'discord.js'
import App from 'app'

import Colors from 'lib/colors.ts'



interface MessageOptions {
    title?: string
    description?: string
    color?: keyof typeof Colors
    components?: Discord.APIActionRowComponent<Discord.APIMessageActionRowComponent>[]
}



export async function reply(interaction: Discord.Interaction, options: MessageOptions & { ephemeral?: boolean }) {
    if (!interaction.isRepliable()) return

    return await interaction.reply({
        ephemeral: options.ephemeral || false,
        embeds: [
            new Discord.EmbedBuilder()
                .setTitle(options.title || null)
                .setColor(options.color ? Colors[options.color] : null)
                .setDescription(options.description || null)
        ],
        components: options.components
    })
}



export async function send(options: MessageOptions, channel?: Discord.TextBasedChannel) {
    const notifyChannel = App.channel(channel?.id || App.config.channels.logs) as Discord.TextChannel

    return await notifyChannel.send({
        embeds: [
            new Discord.EmbedBuilder()
                .setTitle(options.title || null)
                .setColor(options.color ? Colors[options.color] : null)
                .setDescription(options.description || null)
        ],
        components: options.components
    })
}


export default {
    send,
    reply
}