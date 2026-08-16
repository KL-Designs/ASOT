import { ApplicationCommandOptionType } from 'discord.js'
import { memberOption, renderMilpac } from './render.ts'


export default {
    name: 'uniform',
    description: 'Show a member\'s dress uniform, freshly generated',
    type: ApplicationCommandOptionType.Subcommand,
    options: [memberOption],

    execute(interaction) {
        return renderMilpac(interaction, 'uniform')
    }
} as ChatSubcommand
