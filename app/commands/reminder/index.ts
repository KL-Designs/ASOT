import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'

import help from './help.ts'
import create from './create.ts'
import remove from "./remove.ts"


export default {
    name: 'reminder',
    description: 'Reminder Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        help,
        create,
        remove
    ]
} as ChatCommand