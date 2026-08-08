import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'menus',
    description: 'Test Menus',
    type: ApplicationCommandOptionType.Subcommand,

    execute(interaction) {
        interaction.reply({
            ephemeral: true,
            components: [
                new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                    .addComponents(
                        new Discord.StringSelectMenuBuilder()
                            .setCustomId('menu')
                            .addOptions([
                                { label: 'Test', value: 'test' }
                            ])
                    )
            ]
        })
    }

} as ChatSubcommand