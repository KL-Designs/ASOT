import { ApplicationCommandType } from 'discord.js'

import profile from './profile.ts'
import uniform from './uniform.ts'
import medals from './medals.ts'


export default {
    name: 'milpac',
    description: 'Milpac Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        profile,
        uniform,
        medals,
    ]
} as ChatCommand
