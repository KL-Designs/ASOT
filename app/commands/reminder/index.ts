import { ApplicationCommandType } from 'discord.js'

import help from './help.ts'
import create from './create.ts'
import edit from './edit.ts'
import remove from "./remove.ts"
import enable from "./enable.ts"
import disable from "./disable.ts"
import admin from "./admin.ts"


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
        disable,
        admin,
    ]
} as ChatCommand