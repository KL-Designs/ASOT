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


        if (Array.isArray(reminder.acknowledged) && reminder.acknowledged.length > 0 && reminder.nextCheck && reminder.nextCheck.getTime() < today.getTime()) {
            Db.reminders.updateOne({ _id: reminder._id }, {
                $set: {
                    nextCheck: new Date(new Date().getTime() + 1000 * 60 * 60 * 8)
                }
            })

            try {
                channel.send(`${reminder.acknowledged.join(' ')} please acknowledge your reminder!`)
                    .then(msg => setTimeout(() => msg.delete().catch(() => { }), 1000 * 60 * 60 * 8))
            } catch {
                console.error(`Failed to send acknowledgement reminder in "${reminder.channel}" (${reminder.message})`)
            }
            break
        }


        if (reminder.acknowledged === null && reminder.expected.getTime() < today.getTime()) {
            const ackRow = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                .addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId(`reminder.${reminder._id.toString()}.ack`)
                        .setStyle(Discord.ButtonStyle.Success)
                        .setEmoji('👍')
                        .setLabel('Acknowledge')
                )

            const actionRows: Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>[] = [ackRow]

            if (reminder.repeat > 0) {
                actionRows.push(
                    new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                        .addComponents(
                            new Discord.ButtonBuilder()
                                .setCustomId(`reminder.${reminder._id.toString()}.disable`)
                                .setStyle(Discord.ButtonStyle.Danger)
                                .setEmoji('🔌')
                                .setLabel('Disable Reminder')
                        )
                )
            }

            try {
                channel.send({
                    content: reminder.who.join(' '),
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setTitle('Reminder')
                            .setAuthor({ name: 'created by ' + (author.nickname || author.user.globalName || author.user.username), iconURL: author.user.displayAvatarURL() })
                            .setDescription(reminder.message)
                            .setColor(App.colors.warning)
                            .setTimestamp()
                            .addFields({ name: '⏳ Pending', value: reminder.who.join('\n') })
                    ],
                    components: actionRows
                })

                Db.reminders.updateOne({ _id: reminder._id }, {
                    $set: {
                        expected: new Date(reminder.expected.getTime() + reminder.repeat),
                        nextCheck: new Date(new Date().getTime() + 1000 * 60 * 60 * 8),
                        acknowledged: [...reminder.who]
                    }
                })

                console.log(`Reminder ${reminder._id} has been sent`)
            } catch {
                console.error(`Failed to send reminder in "${reminder.channel}" (${reminder.message})`)
            }
            break
        }


        if (reminder.repeat === 0 && reminder.acknowledged === true) { Db.reminders.deleteOne({ _id: reminder._id }), console.log(`Reminder ${reminder._id} has been removed`); break }
    }
}
