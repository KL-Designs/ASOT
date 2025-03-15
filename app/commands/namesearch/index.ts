import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'namesearch',
    description: 'Search a name',
    type: ApplicationCommandType.ChatInput,

    options: [
        {
            name: 'name',
            description: 'Enter a name to search',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const names = [
                    'Jimmy',
                    'Lin',
                    'Bob',
                    'John',
                    'Lang',
                    'Tim',
                    'Andrew',
                    'Thomas'
                ]

                const search = interaction.options.getString('name') || ''
                const results = names.filter(name => name.toLowerCase().includes(search.toLowerCase()))
                const options = results.map(name => ({ name, value: name }))

                interaction.respond(options)
            }
        } as AutocompleteOption
    ],

    execute(interaction) {
        interaction.reply({ content: `Name Selected "${interaction.options.getString('name')}"`, ephemeral: true })
    }
} as ChatCommand