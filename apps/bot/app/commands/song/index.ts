import Discord from 'discord.js'
import submission from './submission.ts'

export default {
    name: 'song',
    description: 'Song Commands',
    type: Discord.ApplicationCommandType.ChatInput,
    dmPermission: false,
    options: [submission]
} as ChatCommand
