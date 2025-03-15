import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'buttons',
    description: 'Test Buttons',
    type: ApplicationCommandOptionType.Subcommand,

    execute(interaction) {
        interaction.reply({
            ephemeral: true,
            components: [
                new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                    .addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('button1')
                            .setLabel('Button1')
                            .setStyle(Discord.ButtonStyle.Secondary)
                            .setEmoji('👆'),

                        new Discord.ButtonBuilder()
                            .setCustomId('button2')
                            .setLabel('Button2')
                            .setStyle(Discord.ButtonStyle.Secondary)
                            .setEmoji('👆'),

                        new Discord.ButtonBuilder()
                            .setCustomId('button3')
                            .setLabel('Button3')
                            .setStyle(Discord.ButtonStyle.Secondary)
                            .setEmoji('👆')
                    ),

                new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                    .addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('error')
                            .setLabel('Throw Error')
                            .setStyle(Discord.ButtonStyle.Danger)
                            .setEmoji('👆'),
                    )
            ]
        })
    }
} as ChatSubcommand