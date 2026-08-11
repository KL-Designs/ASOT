import { ApplicationCommandOptionType } from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { createSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'


export default {
    name: 'edit',
    description: 'Edit an existing reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'reminder',
            description: 'The reminder to edit',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            async response(interaction) {
                const search = interaction.options.getString('reminder') || ''
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const reminders = await Db.reminders.find({ by: interaction.user.id, message: { $regex: escapedSearch, $options: 'i' } }).limit(25).toArray()
                interaction.respond(reminders.map(r => ({
                    name: (r.message.length > 50 ? `${r.message.slice(0, 50)}... | ` : r.message + ' | ') + new Date(r.expected).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }),
                    value: r._id.toString()
                })))
            }
        } as AutocompleteOption,
    ],

    async execute(interaction) {
        const reminderId = interaction.options.getString('reminder', true)
        const reminder = await Db.reminders.findOne({ _id: new ObjectId(reminderId) })

        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })
        if (reminder.by !== interaction.user.id) return interaction.reply({ content: 'You can only edit your own reminders.', ephemeral: true })

        const sessionId = interaction.id

        createSession(sessionId, {
            editId: reminder._id.toString(),
            message: reminder.message,
            expected: reminder.expected.getTime(),
            repeatMs: reminder.repeat,
            repeatLabel: reminder.repeatLabel,
            chaseUpOffset: reminder.chaseUpOffset,
            channel: reminder.channel,
            userId: interaction.user.id,
            pingMe: reminder.who.includes(`<@${interaction.user.id}>`),
            who: reminder.who.filter(w => w !== `<@${interaction.user.id}>`),
        })

        const session = { editId: reminder._id.toString(), message: reminder.message, expected: reminder.expected.getTime(), repeatMs: reminder.repeat, repeatLabel: reminder.repeatLabel, chaseUpOffset: reminder.chaseUpOffset, channel: reminder.channel, userId: interaction.user.id, pingMe: reminder.who.includes(`<@${interaction.user.id}>`), who: reminder.who.filter(w => w !== `<@${interaction.user.id}>`), expiresAt: 0 }

        interaction.reply({
            content: `**Editing Reminder:** ${reminder.message}`,
            components: buildReminderComponents(sessionId, session),
            ephemeral: true
        })
    }
} as ChatSubcommand
