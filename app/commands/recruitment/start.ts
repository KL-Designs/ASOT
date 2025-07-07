import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'start',
    description: 'Start the recruitment process for a new member',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'member',
            description: 'The member to recruit',
            type: ApplicationCommandOptionType.User,
            required: true
        }
    ]

} as ChatSubcommand