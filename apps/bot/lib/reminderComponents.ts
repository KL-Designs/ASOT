import Discord from 'discord.js'
import { ReminderSession } from 'lib/reminderSessions.ts'


export function buildButtonRow(sessionId: string, session: ReminderSession) {
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
        .setLabel(session.editId ? 'Save Changes' : 'Create Reminder')
        .setEmoji(session.editId ? '💾' : '🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    return new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(pingMeButton, chaseUpButton, confirmButton)
}
