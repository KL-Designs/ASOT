import App from 'app'
import Db from 'lib/mongo.ts'
import * as Discord from "discord.js"


export default async function processReminders() {
    const reminders = await Db.reminders.find().toArray()
    const today = new Date()

    for (const reminder of reminders) {
        if (!reminder.enabled) return

        const author = await App.user(reminder.by)

        if (reminder.expected.getTime() < today.getTime()) {
            const channel = await App.channel(reminder.channel) as Discord.TextChannel

            channel.send({
                content: reminder.who.join(' '),
                embeds: [
                    new Discord.EmbedBuilder()
                        .setTitle('Reminder')
                        .setAuthor({ name: 'by ' + (author.nickname || author.user.globalName || author.user.username), iconURL: author.user.displayAvatarURL() })
                        .setDescription(reminder.message)
                        .setColor(App.colors.warning)
                        .setTimestamp()
                ]
            })

            if (reminder.repeat === 0) return Db.reminders.deleteOne({ _id: reminder._id })
            else Db.reminders.updateOne({ _id: reminder._id }, { $set: { expected: new Date(today.getTime() + reminder.repeat) } })
        }
    }
}