import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { getSession, updateSession, deleteSession } from 'lib/reminderSessions.ts'


export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'pingme') {
        const newPingMe = !session.pingMe
        updateSession(sessionId, { pingMe: newPingMe })

        const updatedPingMeButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.pingme`)
            .setLabel(newPingMe ? 'Ping Me: Yes' : 'Ping Me: No')
            .setEmoji(newPingMe ? '✅' : '❌')
            .setStyle(newPingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

        const confirmButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.confirm`)
            .setLabel('Create Reminder')
            .setEmoji('🔔')
            .setStyle(Discord.ButtonStyle.Primary)

        const buttonRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
            .addComponents(updatedPingMeButton, confirmButton)

        const existingComponents = interaction.message.components
        const newComponents = [...existingComponents.slice(0, -1), buttonRow]

        return interaction.update({ components: newComponents })
    }

    if (action === 'confirm') {
        const who: string[] = []

        if (session.pingMe) who.push(`<@${session.userId}>`)
        for (const mention of session.who) who.push(mention)

        if (who.length === 0) {
            return interaction.reply({ content: 'Please select at least one person to remind, or enable "Ping Me".', ephemeral: true })
        }

        const finalDate = new Date()
        let repeat = 0

        const date = session.date || (() => {
            const today = new Date()
            const dd = String(today.getDate()).padStart(2, '0')
            const mm = String(today.getMonth() + 1).padStart(2, '0')
            const yyyy = today.getFullYear()
            return `${dd}/${mm}/${yyyy}`
        })()

        const [day, month, year] = date.split('/')
        finalDate.setDate(parseInt(day))
        finalDate.setMonth(parseInt(month) - 1)
        finalDate.setFullYear(parseInt(year))

        const [hour, minute] = session.time.split(':')
        finalDate.setHours(parseInt(hour))
        finalDate.setMinutes(parseInt(minute))
        finalDate.setSeconds(0)
        finalDate.setMilliseconds(0)

        if (session.repeat !== null) {
            const times = session.repeat.split('/')
            times.forEach(time => {
                const value = Number(time.slice(0, -1))
                const type = time.slice(-1)
                switch (type) {
                    case "m": repeat += 1000 * 60 * value; break
                    case "h": repeat += 1000 * 60 * 60 * value; break
                    case "d": repeat += 1000 * 60 * 60 * 24 * value; break
                    case "w": repeat += 1000 * 60 * 60 * 24 * 7 * value; break
                }
            })
        }

        await Db.reminders.insertOne({
            _id: new ObjectId(),
            enabled: true,
            expected: finalDate,
            acknowledged: null,
            nextCheck: null,
            repeat: repeat,
            by: session.userId,
            who: who,
            message: session.message,
            channel: session.channel
        })

        deleteSession(sessionId)

        return interaction.update({
            content: `✅ Reminder set for <t:${Math.floor(finalDate.getTime() / 1000)}:F>\n>>> ${session.message}`,
            components: []
        })
    }
}
