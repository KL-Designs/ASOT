import { ApplicationCommandType } from 'discord.js'

import uniform from './uniform.ts'
import medals from './medals.ts'


export default {
    name: 'milpac',
    description: 'Milpac Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        uniform,
        medals,
    ]
} as ChatCommand
