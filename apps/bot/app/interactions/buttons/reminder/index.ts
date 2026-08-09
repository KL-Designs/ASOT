import app from 'app'
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const reminder = await Db.reminders.findOne({ _id: new ObjectId(args[0]) })
    const embed = interaction.message.embeds[0]


    if (args[1] === 'ack') {
        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })

        const pending = Array.isArray(reminder.acknowledged) ? [...reminder.acknowledged] : []

        // Find all pending entries this user can ack (direct mention + any matching roles)
        const member = interaction.member as Discord.GuildMember
        const matchedMentions = pending.filter(mention => {
            if (mention.startsWith('<@&')) {
                return member?.roles?.cache?.has(mention.slice(3, -1))
            } else {
                return interaction.user.id === mention.slice(2, -1)
            }
        })

        if (matchedMentions.length === 0) {
            return interaction.reply({ content: 'This acknowledgment isn\'t for you.', ephemeral: true })
        }

        const newPending = pending.filter(m => !matchedMentions.includes(m))
        const allDone = newPending.length === 0

        if (allDone) {
            if (reminder.repeat === 0) {
                await Db.reminders.updateOne({ _id: reminder._id }, { $set: { acknowledged: true, nextCheck: null } })
            } else {
                await Db.reminders.updateOne({ _id: reminder._id }, { $set: { acknowledged: null, nextCheck: null } })
            }

            const newEmbed = {
                ...embed.toJSON(),
                color: app.colors.success,
                fields: [],
                footer: {
                    text: `all acknowledged`,
                    icon_url: interaction.user.displayAvatarURL()
                }
            }
            return interaction.update({ embeds: [newEmbed], components: [] })
        }

        await Db.reminders.updateOne({ _id: reminder._id }, { $set: { acknowledged: newPending } })

        const ackedMentions = reminder.who.filter(m => !newPending.includes(m))
        const fields = [
            { name: '⏳ Pending', value: newPending.join('\n'), inline: true },
            { name: '✅ Acknowledged', value: ackedMentions.join('\n'), inline: true },
        ]

        const newEmbed = { ...embed.toJSON(), fields }
        return interaction.update({ embeds: [newEmbed] })
    }


    if (args[1] === 'disable') {
        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })

        const member = interaction.member as Discord.GuildMember
        const isCreator = interaction.user.id === reminder.by
        const isInWho = reminder.who.some(mention => {
            if (mention.startsWith('<@&')) return member?.roles?.cache?.has(mention.slice(3, -1))
            return interaction.user.id === mention.slice(2, -1)
        })

        if (!isCreator && !isInWho) {
            return interaction.reply({ content: 'Only the reminder creator or tagged members can disable this.', ephemeral: true })
        }

        const newEmbed = {
            ...embed.toJSON(),
            color: app.colors.danger,
            footer: {
                text: `disabled by ${interaction.user.globalName || interaction.user.username}`,
                icon_url: interaction.user.displayAvatarURL()
            }
        }
        interaction.update({ embeds: [newEmbed], components: [] })
        Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: false } })
    }

}
