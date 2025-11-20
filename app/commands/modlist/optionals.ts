import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'


export default {
    name: 'optionals',
    description: 'Upload and set the optional modlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'type',
            description: 'Either Quality of Life, Gfx, or Zeus',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: 'Quality of Life', value: 'qol' },
                { name: 'FPS-Intensive Mods', value: 'gfx' },
                { name: 'Zeus', value: 'zeus' },
                { name: 'J2', value: 'j2' },
                { name: 'J5', value: 'j5' },
            ]
        },
        {
            name: 'modlist',
            description: 'The modlist to be used in optionals selection.',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        }
    ],

    async execute(interaction) {
        try {
            const type = interaction.options.getString('type') as Optional['_id']
            const file = interaction.options.getAttachment('modlist')
            if (!file) throw new Error('No modlist provided')

            const mods = await Modlist.fetchAttachment(file)
            const mapped = Modlist.mapMods(mods)
            Modlist.setOptionals(type, mods)

            interaction.reply({
                content: `### **${type.toUpperCase()} Optionals Updated**\n\`\`\`${mapped.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n').slice(0, 2980)}\`\`\``,
                ephemeral: true
            })
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand