import { ApplicationCommandOptionType } from 'discord.js'
import { createSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'


export default {
    name: 'create',
    description: 'Create a New Reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'reminder',
            description: 'Whats the reminder for?',
            type: ApplicationCommandOptionType.String,
            required: true
        },
    ],

    execute(interaction) {
        const sessionId = interaction.id
        const message = interaction.options.getString('reminder', true)

        createSession(sessionId, {
            editId: null,
            message,
            expected: null,
            repeatMs: 0,
            repeatLabel: null,
            chaseUpOffset: null,
            channel: interaction.channelId,
            userId: interaction.user.id,
            pingMe: true,
            who: [],
        })

        const session = { editId: null, message, expected: null, repeatMs: 0, repeatLabel: null, chaseUpOffset: null, channel: interaction.channelId, userId: interaction.user.id, pingMe: true, who: [], expiresAt: 0 }

        interaction.reply({
            content: `**Reminder:** ${message}\nPick a time, who to remind, and any repeat/chase-up, then confirm.`,
            components: buildReminderComponents(sessionId, session),
            ephemeral: true
        })
    }
} as ChatSubcommand
