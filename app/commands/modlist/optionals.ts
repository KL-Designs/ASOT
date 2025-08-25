import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'


export default {
    name: 'optionals',
    description: 'Upload and set the optional modlists',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'client',
            description: 'The player optionals modlist to be used alongside base mods.',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        },
        {
            name: 'zeus',
            description: 'The optionals modlist to be used alongside base mods.',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        }
    ],

    async execute(interaction) {
        try {
            const clientFile = interaction.options.getAttachment('client')
            const zeusFile = interaction.options.getAttachment('zeus')
            if (!clientFile || !zeusFile) throw new Error('No modlist provided')

            const clientMods = await Modlist.fetchAttachment(clientFile)
            const zeusMods = await Modlist.fetchAttachment(zeusFile)

            const clientMapped = Modlist.mapMods(clientMods)
            const zeusMapped = Modlist.mapMods(zeusMods)

            Modlist.setOptionals(clientMods, "client")
            Modlist.setOptionals(zeusMods, "zeus")

            await interaction.deferReply({ ephemeral: true })

            await interaction.followUp({
                content: `### **Client Optionals Updated**\n\`\`\`${clientMapped.map((mod, index) => `${index + 1} | ${mod.name}`).join('\n').slice(0, 2980)}\`\`\``,
                ephemeral: true
            })

            await interaction.followUp({
                content: `### **Zeus Optionals Updated**\n\`\`\`${zeusMapped.map((mod, index) => `${index + 1} | ${mod.name}`).join('\n').slice(0, 2980)}\`\`\``,
                ephemeral: true
            })
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand