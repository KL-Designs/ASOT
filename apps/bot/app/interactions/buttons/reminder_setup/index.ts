import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { getSession, updateSession, deleteSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { TIME_PRESETS } from 'lib/reminderDate.ts'


async function requireTimezone(interaction: Discord.ButtonInteraction): Promise<string | null> {
    const user = await Db.users.findOne({ id: interaction.user.id })
    if (user?.timezone) return user.timezone
    await interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then click that button again.', ephemeral: true })
    return null
}

function refreshMessage(interaction: Discord.ButtonInteraction, sessionId: string, session: ReminderSession) {
    const components = buildReminderComponents(sessionId, session)
    return interaction.update({ components })
}


export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'time') {
        const presetId = args[2]
        const preset = TIME_PRESETS.find(p => p.id === presetId)
        if (!preset) return interaction.reply({ content: 'Unknown time preset.', ephemeral: true })

        let timezone = ''
        if (preset.needsTimezone) {
            const tz = await requireTimezone(interaction)
            if (!tz) return
            timezone = tz
        }

        const expected = preset.compute(timezone)
        updateSession(sessionId, { expected })
        return refreshMessage(interaction, sessionId, { ...session, expected })
    }

    if (action === 'timecustom') {
        const timezone = await requireTimezone(interaction)
        if (!timezone) return

        const modal = new Discord.ModalBuilder()
            .setCustomId(`reminder_setup.${sessionId}.timecustom`)
            .setTitle('Set Custom Time')
            .addComponents(
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('date')
                        .setLabel(`Date (DD/MM/YYYY), timezone: ${timezone}`)
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('31/12/2026')
                ),
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('time')
                        .setLabel('Time (HH:MM, 24-hour)')
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('14:30')
                )
            )
        return interaction.showModal(modal)
    }

    if (action === 'pingme') {
        const newPingMe = !session.pingMe
        updateSession(sessionId, { pingMe: newPingMe })
        return refreshMessage(interaction, sessionId, { ...session, pingMe: newPingMe })
    }

    if (action === 'confirm') {
        if (session.expected === null) {
            return interaction.reply({ content: 'Please pick a time first.', ephemeral: true })
        }

        const who: string[] = []
        if (session.pingMe) who.push(`<@${session.userId}>`)
        for (const mention of session.who) who.push(mention)

        if (who.length === 0) {
            return interaction.reply({ content: 'Please select at least one person to remind, or enable "Ping Me".', ephemeral: true })
        }

        if (session.editId) {
            await Db.reminders.updateOne({ _id: new ObjectId(session.editId) }, {
                $set: {
                    expected: new Date(session.expected),
                    repeat: session.repeatMs,
                    repeatLabel: session.repeatLabel,
                    who,
                    chaseUpOffset: session.chaseUpOffset,
                    acknowledged: null,
                    nextCheck: null,
                    messageId: null,
                }
            })
        } else {
            await Db.reminders.insertOne({
                _id: new ObjectId(),
                enabled: true,
                expected: new Date(session.expected),
                acknowledged: null,
                nextCheck: null,
                chaseUpOffset: session.chaseUpOffset,
                repeat: session.repeatMs,
                repeatLabel: session.repeatLabel,
                by: session.userId,
                who,
                message: session.message,
                channel: session.channel,
                messageId: null,
                sendFailed: false,
            })
        }

        deleteSession(sessionId)

        const verb = session.editId ? '✅ Reminder updated for' : '✅ Reminder set for'
        let confirmContent = `${verb} <t:${Math.floor(session.expected / 1000)}:F>`
        if (session.chaseUpOffset !== null) {
            const chaseUpTs = Math.floor((session.expected + session.chaseUpOffset) / 1000)
            confirmContent += `\n⏰ Chase up: <t:${chaseUpTs}:F>`
        }
        confirmContent += `\n>>> ${session.message}`

        return interaction.update({ content: confirmContent, components: [] })
    }
}
