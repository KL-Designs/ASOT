import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'

export default {
    name: 'recruit',
    description: 'Recruiter Commands',
    type: ApplicationCommandType.ChatInput,
    dmPermission: false,

    options: [
        
    ]

} as ChatCommand