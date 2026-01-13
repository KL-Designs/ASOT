import app from 'app'
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const reminder = await Db.reminders.findOne({ _id: new ObjectId(args[0]) })
    const embed = interaction.message.embeds[0]


    if (args[1] === 'ack') {
        const newEmbed = {
            ...embed.toJSON(),
            color: app.colors.success,
            footer: {
                text: `acknowledged by ${interaction.user.globalName || interaction.user.username}`,
                icon_url: interaction.user.displayAvatarURL()
            }
        }
        interaction.update({ embeds: [newEmbed], components: [] })

        if (!reminder) return
        if (reminder.repeat !== 0) return
        Db.reminders.updateOne({ _id: reminder._id }, { $set: { acknowledged: true } })
    }

    if (args[1] === 'disable') {
        const newEmbed = {
            ...embed.toJSON(),
            color: app.colors.danger,
            footer: {
                text: `disabled by ${interaction.user.globalName || interaction.user.username}`,
                icon_url: interaction.user.displayAvatarURL()
            }
        }
        interaction.update({ embeds: [newEmbed], components: [] })

        if (!reminder) return
        Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: false } })
    }

}