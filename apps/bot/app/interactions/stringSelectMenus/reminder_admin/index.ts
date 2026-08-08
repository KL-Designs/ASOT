import App from 'app'
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { buildDetailEmbed, buildActionRow } from '../../reminder_admin/shared.ts'


export default async function (interaction: Discord.StringSelectMenuInteraction, args: string[]) {
    if (args[1] !== 'select') return

    const reminderId = interaction.values[0]
    const reminder = await Db.reminders.findOne({ _id: new ObjectId(reminderId) })

    if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })

    const creator = App.user(reminder.by)
    const creatorName = creator?.nickname || creator?.user.globalName || creator?.user.username || reminder.by
    const creatorAvatar = creator?.user.displayAvatarURL()

    const embed = buildDetailEmbed(reminder, creatorName, creatorAvatar)
    const actionRow = buildActionRow(reminderId, reminder.enabled !== false)

    return interaction.update({
        embeds: [embed],
        components: [interaction.message.components[0], actionRow],
    })
}
