import Discord from 'discord.js'
import { getSession, updateSession, ReminderSession } from 'lib/reminderSessions.ts'


function buildButtonRow(sessionId: string, session: ReminderSession) {
    const pingMeButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.pingme`)
        .setLabel(session.pingMe ? 'Ping Me: Yes' : 'Ping Me: No')
        .setEmoji(session.pingMe ? '✅' : '❌')
        .setStyle(session.pingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

    const chaseUpButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.chaseup`)
        .setLabel(session.chaseUpTime ? 'Chase Up Set' : 'Set Chase Up')
        .setEmoji('⏰')
        .setStyle(session.chaseUpTime ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Secondary)

    const confirmButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.confirm`)
        .setLabel('Create Reminder')
        .setEmoji('🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    return new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(pingMeButton, chaseUpButton, confirmButton)
}


export default async function (interaction: Discord.ModalSubmitInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'chaseup') {
        const timeInput = interaction.fields.getTextInputValue('chaseup_time').trim()
        const dateInput = interaction.fields.getTextInputValue('chaseup_date').trim()

        if (!/^\d{2}:\d{2}$/.test(timeInput)) {
            return interaction.reply({ content: 'Invalid time format. Use HH:MM.', ephemeral: true })
        }
        const [ch, cm] = timeInput.split(':').map(Number)
        if (ch < 0 || ch > 23 || cm < 0 || cm > 59) {
            return interaction.reply({ content: 'Invalid time. Hours must be 00-23, minutes 00-59.', ephemeral: true })
        }

        if (dateInput && !/^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
            return interaction.reply({ content: 'Invalid date format. Use DD/MM/YYYY.', ephemeral: true })
        }

        // Resolve reminder date (same logic as confirm handler)
        const reminderDateStr = session.date || (() => {
            const t = new Date()
            return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`
        })()

        const chaseUpDateStr = dateInput || reminderDateStr

        // Build both datetimes and validate order
        const [rd, rm, ry] = reminderDateStr.split('/').map(Number)
        const [rh, rmin] = session.time.split(':').map(Number)
        const reminderDatetime = new Date(ry, rm - 1, rd, rh, rmin, 0, 0)

        const [cd, cmo, cy] = chaseUpDateStr.split('/').map(Number)
        const chaseUpDatetime = new Date(cy, cmo - 1, cd, ch, cm, 0, 0)

        if (chaseUpDatetime <= reminderDatetime) {
            return interaction.reply({ content: 'Chase up time must be after the reminder time.', ephemeral: true })
        }

        updateSession(sessionId, { chaseUpTime: timeInput, chaseUpDate: chaseUpDateStr })
        const updatedSession = { ...session, chaseUpTime: timeInput, chaseUpDate: chaseUpDateStr }

        const buttonRow = buildButtonRow(sessionId, updatedSession)
        const existingComponents = interaction.message!.components
        const newComponents = [...existingComponents.slice(0, -1), buttonRow]

        const chaseUpTs = Math.floor(chaseUpDatetime.getTime() / 1000)
        const baseContent = interaction.message!.content.split('\n⏰')[0]

        return interaction.update({
            content: `${baseContent}\n⏰ **Chase Up:** <t:${chaseUpTs}:F>`,
            components: newComponents
        })
    }
}
