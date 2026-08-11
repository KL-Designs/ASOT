import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { toZonedTime } from 'date-fns-tz'
import { getSession, updateSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { fromZoned, isRealDate } from 'lib/reminderDate.ts'


export default async function (interaction: Discord.ModalSubmitInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (!interaction.isFromMessage()) return interaction.reply({ content: 'This interaction is not attached to a message.', ephemeral: true })

    if (action === 'timecustom') {
        const dateInput = interaction.fields.getTextInputValue('date').trim()
        const timeInput = interaction.fields.getTextInputValue('time').trim()

        if (!isRealDate(dateInput)) return interaction.reply({ content: 'Invalid date. Use DD/MM/YYYY and check it\'s a real date.', ephemeral: true })

        const user = await Db.users.findOne({ id: interaction.user.id })
        const timezone = user?.timezone
        if (!timezone) return interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then try again.', ephemeral: true })

        const expected = fromZoned(dateInput, timeInput, timezone)
        if (expected === null) return interaction.reply({ content: 'Invalid time. Use HH:MM, 24-hour.', ephemeral: true })
        if (expected < Date.now()) return interaction.reply({ content: 'That time is in the past.', ephemeral: true })

        updateSession(sessionId, { expected })
        const updated: ReminderSession = { ...session, expected }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (action === 'repeatcustom') {
        const amountInput = interaction.fields.getTextInputValue('amount').trim()
        const unitInput = interaction.fields.getTextInputValue('unit').trim().toLowerCase()

        const amount = Number(amountInput)
        const unitMs: Record<string, number> = { m: 60_000, h: 60 * 60_000, d: 24 * 60 * 60_000, w: 7 * 24 * 60 * 60_000 }
        const unitLabel: Record<string, string> = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }

        if (isNaN(amount) || amount <= 0 || !(unitInput in unitMs)) {
            return interaction.reply({ content: 'Invalid repeat interval. Amount must be a positive number, unit must be m/h/d/w.', ephemeral: true })
        }

        const patch = { repeatMs: amount * unitMs[unitInput], repeatLabel: `Every ${amount} ${unitLabel[unitInput]}` }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (action === 'chaseupcustom') {
        const dateInput = interaction.fields.getTextInputValue('date').trim()
        const timeInput = interaction.fields.getTextInputValue('time').trim()

        if (dateInput && !isRealDate(dateInput)) return interaction.reply({ content: 'Invalid date. Use DD/MM/YYYY.', ephemeral: true })
        if (session.expected === null) return interaction.reply({ content: 'Pick a reminder time before setting a chase-up.', ephemeral: true })

        const user = await Db.users.findOne({ id: interaction.user.id })
        const timezone = user?.timezone
        if (!timezone) return interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then try again.', ephemeral: true })

        const reminderDate = toZonedTime(new Date(session.expected), timezone)
        const fallbackDateStr = `${String(reminderDate.getDate()).padStart(2, '0')}/${String(reminderDate.getMonth() + 1).padStart(2, '0')}/${reminderDate.getFullYear()}`
        const chaseUpDateStr = dateInput || fallbackDateStr

        const chaseUpTime = fromZoned(chaseUpDateStr, timeInput, timezone)
        if (chaseUpTime === null) return interaction.reply({ content: 'Invalid time. Use HH:MM.', ephemeral: true })
        if (chaseUpTime <= session.expected) return interaction.reply({ content: 'Chase up time must be after the reminder time.', ephemeral: true })

        const patch = { chaseUpOffset: chaseUpTime - session.expected }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }
}
