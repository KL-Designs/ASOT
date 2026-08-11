import Db from 'lib/mongo.ts'
import { ApplicationCommandOptionType } from 'discord.js'
import { searchTimezones } from 'lib/timezones.ts'


export default {
    name: 'timezone',
    description: 'Set your timezone, used to interpret every reminder time you enter',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'zone',
            description: 'Search for your city or region, e.g. "sydney" or "new york"',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('zone') || ''
                const matches = searchTimezones(search)
                if (matches.length === 0) return interaction.respond([{ name: 'No matching timezone found', value: 'invalid' }])
                return interaction.respond(matches)
            }
        } as AutocompleteOption,
    ],

    async execute(interaction) {
        const zone = interaction.options.getString('zone', true)
        if (zone === 'invalid' || !Intl.supportedValuesOf('timeZone').includes(zone)) {
            return interaction.reply({ content: 'Please select a timezone from the autocomplete list.', ephemeral: true })
        }

        await Db.users.updateOne({ id: interaction.user.id }, { $set: { timezone: zone } }, { upsert: true })

        return interaction.reply({ content: `✅ Your timezone is now set to **${zone.replace(/_/g, ' ')}**.`, ephemeral: true })
    }
} as ChatSubcommand
