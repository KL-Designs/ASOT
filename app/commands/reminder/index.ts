import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'

import help from './help.ts'
import create from './create.ts'


export default {
    name: 'reminder',
    description: 'Reminder Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        help,
        create
    ]
} as ChatCommand