import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'group',
    description: 'Test Group',
    type: ApplicationCommandOptionType.SubcommandGroup,

    options: [
        {
            name: 'sub1',
            description: 'Subcommand 1',
            type: ApplicationCommandOptionType.Subcommand,
            execute(interaction) {
                interaction.reply({ content: 'Subcommand 1', ephemeral: true })
            }
        } as ChatSubcommand,

        {
            name: 'sub2',
            description: 'Subcommand 2',
            type: ApplicationCommandOptionType.Subcommand,
            execute(interaction) {
                interaction.reply({ content: 'Subcommand 2', ephemeral: true })
            }
        } as ChatSubcommand
    ]
} as ChatSubcommandGroup