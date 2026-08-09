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
                const search = interaction.options.getString('repeat') || ''

                const reminders = await Db.reminders.find({ by: interaction.user.id, message: { $regex: search, $options: 'i' } }).limit(25).toArray()

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
        const reminder = interaction.options.getString('reminder')
        
        await Db.reminders.deleteOne({_id: new ObjectId(reminder)})

        interaction.reply({content: `Reminder "${reminder}" has been removed.`, ephemeral: true})
    }
} as ChatSubcommand