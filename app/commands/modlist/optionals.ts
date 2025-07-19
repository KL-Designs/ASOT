import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'


export default {
    name: 'optionals',
    description: 'Upload and set the optional modlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'modlist',
            description: 'The optionals modlist to be used alongside base mods.',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        }
    ],

    async execute(interaction) {
        try {
            const file = interaction.options.getAttachment('modlist')
            if (!file) throw new Error('No modlist provided')

            const mods = await Modlist.fetchAttachment(file)
            const mapped = Modlist.mapMods(mods)
            Modlist.setOptionals(mods)

            interaction.reply({
                content: `### **Optionals Updated**\n\`\`\`${mapped.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n').slice(0,2980)}\`\`\``,
                ephemeral: true
            })
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand