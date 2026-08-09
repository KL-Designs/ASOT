import { ApplicationCommandOptionType } from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from "mongodb"


export default {
    name: 'disable',
    description: 'Disable an active reminder',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
        {
            name: 'reminder',
            description: 'The reminder to disable',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            async response(interaction) {
                const search = interaction.options.getString('reminder') || ''

                const reminders = await Db.reminders.find({ by: interaction.user.id, enabled: { $ne: false }, message: { $regex: search, $options: 'i' } }).limit(25).toArray()

                interaction.respond(reminders.map(r => ({
                    name: `${r.message.length > 45 ? r.message.slice(0, 45) + '...' : r.message} | ${new Date(r.expected).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`,
                    value: r._id.toString()
                })))
            }

        } as AutocompleteOption,
    ],

    async execute(interaction) {
        const reminderId = interaction.options.getString('reminder', true)
        const reminder = await Db.reminders.findOne({ _id: new ObjectId(reminderId) })

        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })

        await Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: false } })

        interaction.reply({ content: `🔌 Reminder disabled: **${reminder.message}**`, ephemeral: true })
    }
} as ChatSubcommand
