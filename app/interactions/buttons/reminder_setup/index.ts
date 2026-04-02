import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { getSession, updateSession, deleteSession, ReminderSession } from 'lib/reminderSessions.ts'


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
        .setLabel(session.editId ? 'Save Changes' : 'Create Reminder')
        .setEmoji(session.editId ? '💾' : '🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    return new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(pingMeButton, chaseUpButton, confirmButton)
}


export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'pingme') {
        const newPingMe = !session.pingMe
        updateSession(sessionId, { pingMe: newPingMe })

        const buttonRow = buildButtonRow(sessionId, { ...session, pingMe: newPingMe })
        const existingComponents = interaction.message.components
        const newComponents = [...existingComponents.slice(0, -1), buttonRow]

        return interaction.update({ components: newComponents })
    }

    if (action === 'chaseup') {
        const modal = new Discord.ModalBuilder()
            .setCustomId(`reminder_setup.${sessionId}.chaseup`)
            .setTitle('Set Chase Up Time')
            .addComponents(
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('chaseup_time')
                        .setLabel('Chase Up Time (HH:MM)')
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('07:00')
                        .setValue(session.chaseUpTime ?? '')
                ),
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('chaseup_date')
                        .setLabel('Chase Up Date (DD/MM/YYYY, blank = same day)')
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(false)
                        .setPlaceholder('DD/MM/YYYY')
                        .setValue(session.chaseUpDate ?? '')
                )
            )
        return interaction.showModal(modal)
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

        let chaseUpOffset: number | null = null
        if (session.chaseUpTime !== null) {
            const chaseUpDateStr = session.chaseUpDate || date
            const [cd, cm, cy] = chaseUpDateStr.split('/').map(Number)
            const [ch, cmin] = session.chaseUpTime.split(':').map(Number)
            const chaseUpDate = new Date(cy, cm - 1, cd, ch, cmin, 0, 0)
            chaseUpOffset = chaseUpDate.getTime() - finalDate.getTime()
        }

        if (session.editId) {
            await Db.reminders.updateOne({ _id: new ObjectId(session.editId) }, {
                $set: {
                    expected: finalDate,
                    repeat: repeat,
                    repeatRaw: session.repeat,
                    who: who,
                    chaseUpOffset: chaseUpOffset,
                    acknowledged: null,
                    nextCheck: null,
                    messageId: null,
                }
            })
        } else {
            await Db.reminders.insertOne({
                _id: new ObjectId(),
                enabled: true,
                expected: finalDate,
                acknowledged: null,
                nextCheck: null,
                chaseUpOffset: chaseUpOffset,
                repeat: repeat,
                repeatRaw: session.repeat,
                by: session.userId,
                who: who,
                message: session.message,
                channel: session.channel,
                messageId: null,
            })
        }

        deleteSession(sessionId)

        const verb = session.editId ? '✅ Reminder updated for' : '✅ Reminder set for'
        let confirmContent = `${verb} <t:${Math.floor(finalDate.getTime() / 1000)}:F>`
        if (chaseUpOffset !== null) {
            const chaseUpTs = Math.floor((finalDate.getTime() + chaseUpOffset) / 1000)
            confirmContent += `\n⏰ Chase up: <t:${chaseUpTs}:F>`
        }
        confirmContent += `\n>>> ${session.message}`

        return interaction.update({ content: confirmContent, components: [] })
    }
}
