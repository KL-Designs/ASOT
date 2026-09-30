import App from 'app'
import Db from 'lib/mongo.ts'
import * as Discord from "discord.js"
import { nextOccurrence } from 'lib/reminderDate.ts'



export default async function processReminders() {
    const reminders = await Db.reminders.find().toArray()
    const today = new Date()

    for (const reminder of reminders) {
        // App.channel only reads the guild cache, which doesn't hold archived threads;
        // fall back to the API so a reminder in a quiet thread isn't skipped forever.
        const channel = (App.channel(reminder.channel) ?? await App.client.channels.fetch(reminder.channel).catch(() => null)) as Discord.TextChannel | null
        if (!channel) {
            console.error(`[processReminders] Channel ${reminder.channel} not found for reminder ${reminder._id} — skipping`)
            continue
        }
        if (!reminder.enabled) {
            // A disabled reminder does nothing at all: no send and no chase-up. Its
            // schedule keeps rolling forward so re-enabling it doesn't fire a backlog,
            // and any in-flight cycle is cancelled — the pending chase-up is dropped and
            // a repeating reminder starts fresh on its next occurrence (disabling via the
            // button strips the ack buttons, so the old cycle could never complete).
            const update: Partial<Reminder> = {}
            if (reminder.expected.getTime() < today.getTime()) update.expected = new Date(reminder.expected.getTime() + reminder.repeat)
            if (reminder.nextCheck !== null) update.nextCheck = null
            if (reminder.repeat > 0 && Array.isArray(reminder.acknowledged)) update.acknowledged = null
            if (Object.keys(update).length > 0) await Db.reminders.updateOne({ _id: reminder._id }, { $set: update })
            continue
        }

        const author = App.user(reminder.by)
        const authorName = author ? (author.nickname || author.user.globalName || author.user.username) : 'Unknown'
        const authorAvatar = author?.user.displayAvatarURL()


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
                    await channel.send(`${channelPings.join(' ')} please acknowledge your reminder!`)
                } catch {
                    console.error(`Failed to send chase-up in "${reminder.channel}" (${reminder.message})`)
                }
            }
            continue
        }


        // A repeating reminder's next occurrence supersedes the previous one even if
        // somebody never acknowledged it — otherwise one absent recipient stops the
        // reminder for everyone, permanently.
        const readyToFire = reminder.acknowledged === null || (reminder.repeat > 0 && Array.isArray(reminder.acknowledged))
        if (readyToFire && reminder.expected.getTime() < today.getTime()) {
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
                            .setAuthor({ name: 'created by ' + authorName, iconURL: authorAvatar })
                            .setDescription(reminder.message)
                            .setColor(App.colors.warning)
                            .setTimestamp()
                            .addFields({ name: '⏳ Pending', value: reminder.who.join('\n') })
                    ],
                    components: actionRows
                })

                // The creator's zone keeps day-based repeats on the same wall-clock time
                // across daylight saving changes.
                const timezone = reminder.repeat > 0 ? (await Db.users.findOne({ id: reminder.by }))?.timezone : null
                await Db.reminders.updateOne({ _id: reminder._id }, {
                    $set: {
                        expected: nextOccurrence(reminder.expected, reminder.repeat, today, timezone),
                        // Relative to the actual send, so a reminder that fired late (bot
                        // was down) doesn't chase up on the very next tick.
                        nextCheck: reminder.chaseUpOffset !== null ? new Date(today.getTime() + reminder.chaseUpOffset) : null,
                        acknowledged: [...reminder.who],
                        messageId: sent.id,
                        sendFailed: false
                    }
                })

                console.log(`Reminder ${reminder._id} has been sent`)
            } catch {
                console.error(`Failed to send reminder in "${reminder.channel}" (${reminder.message})`)
                if (!reminder.sendFailed && author) {
                    try {
                        await author.send(`Failed to send your reminder **${reminder.message}** in <#${reminder.channel}>. The bot may not have access to that channel.`)
                    } catch {
                        console.error(`Failed to DM author ${reminder.by} about failed reminder (${reminder.message})`)
                    }
                }
                if (!reminder.sendFailed) {
                    await Db.reminders.updateOne({ _id: reminder._id }, { $set: { sendFailed: true } })
                }
            }
            continue
        }


        if (reminder.repeat === 0 && reminder.acknowledged === true) {
            await Db.reminders.deleteOne({ _id: reminder._id })
            console.log(`Reminder ${reminder._id} has been removed`)
            continue
        }
    }
}

