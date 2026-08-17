import { ApplicationCommandOptionType } from 'discord.js'
import { memberOption, hiddenOption, renderMilpac } from './render.ts'


export default {
    name: 'profile',
    description: 'Show a member\'s full personnel file — uniform, medals, service record and kit',
    type: ApplicationCommandOptionType.Subcommand,
    options: [memberOption, hiddenOption],

    execute(interaction) {
        return renderMilpac(interaction, 'dossier')
    }
} as ChatSubcommand
