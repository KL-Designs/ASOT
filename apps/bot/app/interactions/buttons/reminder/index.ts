import app from 'app'
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId, UpdateFilter } from 'mongodb'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const reminder = await Db.reminders.findOne({ _id: new ObjectId(args[0]) })
    const embed = interaction.message.embeds[0]


    if (args[1] === 'ack') {
        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })
        // An older message's button would otherwise ack the reminder's *current* round.
        if (reminder.messageId !== interaction.message.id) {
            return interaction.reply({ content: 'This reminder has moved on since this message was sent.', ephemeral: true })
        }

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

        // Atomic $pull rather than read-modify-write: two people acking at the same
        // moment would otherwise each write back a list still containing the other,
        // and the reminder never completes.
        const updated = await Db.reminders.findOneAndUpdate(
            { _id: reminder._id, messageId: interaction.message.id, acknowledged: { $type: 'array' } },
            // Cast: the driver can't type $pull against the `string[] | true | null` union;
            // the filter above guarantees it's an array here.
            { $pull: { acknowledged: { $in: matchedMentions } } } as unknown as UpdateFilter<Reminder>,
            { returnDocument: 'after' }
        )
        if (!updated) return interaction.reply({ content: 'This reminder has already been acknowledged.', ephemeral: true })

        const newPending = Array.isArray(updated.acknowledged) ? updated.acknowledged : []
        const allDone = newPending.length === 0

        if (allDone) {
            await Db.reminders.updateOne(
                { _id: reminder._id, acknowledged: { $size: 0 } },
                { $set: { acknowledged: reminder.repeat === 0 ? true : null, nextCheck: null } }
            )

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
        await interaction.update({ embeds: [newEmbed], components: [] })
        await Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: false } })
    }

}
