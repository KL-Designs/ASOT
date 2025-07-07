import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'
import fs, { existsSync } from 'node:fs'
import { Buffer } from "node:buffer"
import { XMLParser } from 'fast-xml-parser'


export default {
    name: 'add',
    description: 'Add a new Modlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'name',
            description: 'The name of the list that users will select from',
            type: ApplicationCommandOptionType.String,
            min_length: 3,
            max_length: 20,
            required: true
        },
        {
            name: 'description',
            description: 'The description of the modlist',
            type: ApplicationCommandOptionType.String,
            min_length: 3,
            max_length: 100,
            required: true
        },
        {
            name: 'optionals',
            description: 'Set as true to use optional mods',
            type: ApplicationCommandOptionType.Boolean,
            required: true
        },
        {
            name: 'modlist',
            description: 'The base mods required to play',
            type: ApplicationCommandOptionType.Attachment,
            required: true
        }
    ],

    async execute(interaction) {
        try {
            const name = interaction.options.getString('name')
            const useOptionals = interaction.options.getBoolean('optionals')
            const file = interaction.options.getAttachment('modlist')
            if (!file) throw new Error('No modlist provided')

            const mods = await Modlist.fetchAttachment(file)
            const mapped = Modlist.mapMods(mods)

            Modlist.addList({
                id: file.id,
                name: name,
                description: interaction.options.getString('description'),
                useOptionals: useOptionals,
                mods: Modlist.mapMods(mods),
                xml: mods
            })

            interaction.reply({
                content: `### **Added | ${name}**\n\`\`\`${mapped.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n')}\`\`\``,
                ephemeral: true
            })
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand