import App from 'app'
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { buildDetailEmbed, buildActionRow } from '../../reminder_admin/shared.ts'


export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const reminderId = args[0]
    const action = args[1]

    const reminder = await Db.reminders.findOne({ _id: new ObjectId(reminderId) })
    if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })

    if (action === 'toggle') {
        const newEnabled = reminder.enabled === false
        await Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: newEnabled } })

        const creator = App.user(reminder.by)
        const creatorName = creator?.nickname || creator?.user.globalName || creator?.user.username || reminder.by
        const creatorAvatar = creator?.user.displayAvatarURL()

        const updatedReminder = { ...reminder, enabled: newEnabled }
        const embed = buildDetailEmbed(updatedReminder, creatorName, creatorAvatar)
        const actionRow = buildActionRow(reminderId, newEnabled)

        return interaction.update({
            embeds: [embed],
            components: [interaction.message.components[0], actionRow],
        })
    }

    if (action === 'remove') {
        await Db.reminders.deleteOne({ _id: reminder._id })

        return interaction.update({
            content: `🗑️ Reminder removed: **${reminder.message}**`,
            embeds: [],
            components: [interaction.message.components[0]],
        })
    }
}
