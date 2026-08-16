import { ApplicationCommandOptionType } from 'discord.js'
import { memberOption, renderMilpac } from './render.ts'


export default {
    name: 'medals',
    description: 'Show a member\'s medal display, freshly generated',
    type: ApplicationCommandOptionType.Subcommand,
    options: [memberOption],

    execute(interaction) {
        return renderMilpac(interaction, 'medals')
    }
} as ChatSubcommand
