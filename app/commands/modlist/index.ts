import Discord from 'discord.js'

import add from './add.ts'
import remove from './remove.ts'
import optionals from './optionals.ts'
import menu from './menu.ts'


export default {
    name: 'modlist',
    description: 'Access our Modlists',
    type: Discord.ApplicationCommandType.ChatInput,
    dmPermission: false,

    options: [
        add,
        remove,
        optionals,
        menu,
    ]
} as ChatCommand