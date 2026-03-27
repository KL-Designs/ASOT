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
            await Db.reminders.updateOne({ _id: reminder._id }, { $set: { nextCheck: null } })

            const channelPings: string[] = []
            for (const mention of reminder.acknowledged) {
                if (mention.startsWith('<@&')) {
                    channelPings.push(mention)
                } else {
                    const member = App.user(mention.slice(2, -1))
                    if (member) {
                        const jumpLink = reminder.messageId
                            ? `\nhttps://discord.com/channels/${App.guild().id}/${channel.id}/${reminder.messageId}`
                            : ''
                        try {
                            await member.send(`You have an unacknowledged reminder: **${reminder.message}**${jumpLink}`)
                        } catch {
                            channelPings.push(mention)
                        }
                    } else {
                        channelPings.push(mention)
                    }
                }
            }

            if (channelPings.length > 0) {
                try {
                    channel.send(`${channelPings.join(' ')} please acknowledge your reminder!`)
                } catch {
                    console.error(`Failed to send chase-up in "${reminder.channel}" (${reminder.message})`)
                }
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
                const sent = await channel.send({
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
                        nextCheck: reminder.chaseUpOffset !== null ? new Date(reminder.expected.getTime() + reminder.chaseUpOffset) : null,
                        acknowledged: [...reminder.who],
                        messageId: sent.id
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
