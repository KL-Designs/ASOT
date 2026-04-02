import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'

import help from './help.ts'
import create from './create.ts'
import edit from './edit.ts'
import remove from "./remove.ts"
import enable from "./enable.ts"
import disable from "./disable.ts"


export default {
    name: 'reminder',
    description: 'Reminder Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        help,
        create,
        edit,
        remove,
        enable,
        disable
    ]
} as ChatCommand