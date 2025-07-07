import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'


export default {
    name: 'remove',
    description: 'Remove an existing modlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'modlist',
            description: 'Enter modlist name',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const modlists = Modlist.fetchLists()

                const search = interaction.options.getString('modlist') || ''
                const results = modlists.filter(list => list.name.toLowerCase().includes(search.toLowerCase()))
                const options = results.map(list => ({ name: list.name, value: list.name }))

                interaction.respond(options)
            }
        } as AutocompleteOption
    ],

    execute(interaction) {
        try {
            const name = interaction.options.getString('modlist')
            Modlist.removeList(name)
            interaction.reply({ content: `**${name}** has been removed`, ephemeral: true })
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand