import Discord, { ApplicationCommandOptionType } from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from "mongodb"


export default {
    name: 'remove',
    description: 'Remove a reminder',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
        {
            name: 'reminder',
            description: 'The reminder to remove',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            async response(interaction) {
                const search = interaction.options.getString('reminder') || ''
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

                const reminders = await Db.reminders.find({ by: interaction.user.id, message: { $regex: escapedSearch, $options: 'i' } }).limit(25).toArray()

                interaction.respond(reminders.map(r => {
                    return {
                        name: (r.message.length > 50 ? `${r.message.slice(0, 50)}... | ` : r.message + ' | ') + new Date(r.expected).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }),
                        value: r._id.toString()
                    }
                }))
            }

        } as AutocompleteOption,
    ],

    async execute(interaction) {
        const reminderId = interaction.options.getString('reminder', true)

        let objectId: ObjectId
        try {
            objectId = new ObjectId(reminderId)
        } catch {
            return interaction.reply({ content: 'Invalid reminder ID.', ephemeral: true })
        }

        const reminder = await Db.reminders.findOne({ _id: objectId })
        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })
        if (reminder.by !== interaction.user.id) return interaction.reply({ content: 'You can only remove your own reminders.', ephemeral: true })

        await Db.reminders.deleteOne({ _id: objectId })

        interaction.reply({ content: `Reminder "${reminder.message}" has been removed.`, ephemeral: true })
    }
} as ChatSubcommand