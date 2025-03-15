import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'ping',
    description: 'Test Ping',
    type: ApplicationCommandType.ChatInput,

    execute(interaction) {
        interaction.reply({ content: `Responded in ${interaction.client.ws.ping}ms`, ephemeral: true })
    }
} as ChatCommand