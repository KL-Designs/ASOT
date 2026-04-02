import App from 'app'
import Discord from 'discord.js'


export function buildDetailEmbed(reminder: Reminder, creatorName: string, creatorAvatar: string | undefined) {
    const isEnabled = reminder.enabled !== false

    let repeatText = 'One-time'
    if (reminder.repeat > 0) {
        repeatText = reminder.repeatRaw ?? `every ${reminder.repeat}ms`
    }

    const embed = new Discord.EmbedBuilder()
        .setTitle(reminder.message)
        .setColor(isEnabled ? App.colors.success : App.colors.danger)
        .setAuthor({ name: `Created by ${creatorName}`, iconURL: creatorAvatar })
        .addFields(
            { name: 'Status', value: isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Next Expected', value: `<t:${Math.floor(reminder.expected.getTime() / 1000)}:F>`, inline: true },
            { name: 'Repeat', value: repeatText, inline: true },
            { name: 'Who', value: reminder.who.join('\n') || 'Nobody' },
        )

    if (reminder.chaseUpOffset !== null) {
        const chaseUpTs = Math.floor((reminder.expected.getTime() + reminder.chaseUpOffset) / 1000)
        embed.addFields({ name: '⏰ Chase Up', value: `<t:${chaseUpTs}:F>`, inline: true })
    }

    return embed
}

export function buildActionRow(reminderId: string, isEnabled: boolean) {
    const toggleButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_admin.${reminderId}.toggle`)
        .setLabel(isEnabled ? 'Disable' : 'Enable')
        .setEmoji(isEnabled ? '🔌' : '✅')
        .setStyle(isEnabled ? Discord.ButtonStyle.Secondary : Discord.ButtonStyle.Success)

    const removeButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_admin.${reminderId}.remove`)
        .setLabel('Remove')
        .setEmoji('🗑️')
        .setStyle(Discord.ButtonStyle.Danger)

    return new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(toggleButton, removeButton)
}
