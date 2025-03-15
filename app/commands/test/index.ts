import Discord from 'discord.js'

import group from './group/index.ts'
import buttons from './buttons.ts'
import menus from './menus.ts'


export default {
    name: 'test',
    description: 'Test Commands',
    type: Discord.ApplicationCommandType.ChatInput,

    options: [
        group,
        buttons,
        menus
    ]
} as ChatCommand