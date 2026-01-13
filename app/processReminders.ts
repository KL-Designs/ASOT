import App from 'app'
import Db from 'lib/mongo.ts'
import * as Discord from "discord.js"


export default async function processReminders() {
    const reminders = await Db.reminders.find().toArray()
    const today = new Date()

    for (const reminder of reminders) {
        const channel = await App.channel(reminder.channel) as Discord.TextChannel
        if (!reminder.enabled && reminder.expected.getTime() < today.getTime()) { Db.reminders.updateOne({ _id: reminder._id }, { $set: { expected: new Date(reminder.expected.getTime() + reminder.repeat) } }); break }

        const author = await App.user(reminder.by)


        if (typeof reminder.acknowledged === 'number' && reminder.nextCheck.getTime() < today.getTime()) {
            Db.reminders.updateOne({ _id: reminder._id }, {
                $set: {
                    acknowledged: reminder.acknowledged > 0 ? reminder.acknowledged - 1 : true,
                    nextCheck: new Date(new Date().getTime() + 1000 * 60 * 60 * 8)
                }
            })
            channel.send(`${reminder.who.join(' ')} please acknowledge your reminder!`).then(msg => setTimeout(() => msg.delete().catch(() => { }), 1000 * 60 * 60 * 8))
            break
        }


        if (reminder.acknowledged === null && reminder.expected.getTime() < today.getTime()) {
            const acknowledgeButton = new Discord.ButtonBuilder()
                .setCustomId(`reminder.${reminder._id.toString()}.ack`)
                .setStyle(Discord.ButtonStyle.Success)
                .setEmoji('👍')
                .setLabel('Acknowledge')

            const removeButton = new Discord.ButtonBuilder()
                .setCustomId(`reminder.${reminder._id.toString()}.disable`)
                .setStyle(Discord.ButtonStyle.Danger)
                .setEmoji('🔌')
                .setLabel('Disable Reminder')

            const actionRow = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
            if (reminder.repeat === 0) actionRow.addComponents(acknowledgeButton)
            if (reminder.repeat > 0) actionRow.addComponents(acknowledgeButton, removeButton)

            channel.send({
                content: reminder.who.join(' '),
                embeds: [
                    new Discord.EmbedBuilder()
                        .setTitle('Reminder')
                        .setAuthor({ name: 'created by ' + (author.nickname || author.user.globalName || author.user.username), iconURL: author.user.displayAvatarURL() })
                        .setDescription(reminder.message)
                        .setColor(App.colors.warning)
                        .setTimestamp()
                ],
                components: [actionRow]
            })

            Db.reminders.updateOne({ _id: reminder._id }, {
                $set: {
                    expected: new Date(reminder.expected.getTime() + reminder.repeat),
                    nextCheck: reminder.repeat === 0 ? new Date(new Date().getTime() + 1000 * 60 * 60 * 8) : null,
                    acknowledged: reminder.repeat === 0 && reminder.acknowledged === null ? 2 : null
                }
            })

            console.log(`Reminder ${reminder._id} has been sent`)
            break
        }

        if (reminder.repeat === 0 && reminder.acknowledged === true) { Db.reminders.deleteOne({ _id: reminder._id }), console.log(`Reminder ${reminder._id} has been removed`); break }
    }
}