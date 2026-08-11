import Discord from 'discord.js'
import { getSession, updateSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { REPEAT_PRESETS, CHASEUP_PRESETS } from 'lib/reminderDate.ts'


export default async function (interaction: Discord.StringSelectMenuInteraction, args: string[]) {
    const sessionId = args[0]
    const field = args[1] // 'repeat' | 'chaseup'

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    const value = interaction.values[0]

    if (field === 'repeat') {
        if (value === 'custom') {
            const modal = new Discord.ModalBuilder()
                .setCustomId(`reminder_setup.${sessionId}.repeatcustom`)
                .setTitle('Custom Repeat Interval')
                .addComponents(
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('3')
                    ),
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('unit').setLabel('Unit: m / h / d / w').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('d')
                    )
                )
            return interaction.showModal(modal)
        }

        const preset = REPEAT_PRESETS.find(p => p.id === value)
        if (!preset) return interaction.reply({ content: 'Unknown repeat option.', ephemeral: true })

        const patch = { repeatMs: preset.ms, repeatLabel: preset.id === 'none' ? null : preset.label }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (field === 'chaseup') {
        if (value === 'custom') {
            const modal = new Discord.ModalBuilder()
                .setCustomId(`reminder_setup.${sessionId}.chaseupcustom`)
                .setTitle('Custom Chase-Up Time')
                .addComponents(
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('date').setLabel('Date (DD/MM/YYYY, blank = same day)').setStyle(Discord.TextInputStyle.Short).setRequired(false).setPlaceholder('DD/MM/YYYY')
                    ),
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('time').setLabel('Time (HH:MM)').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('07:00')
                    )
                )
            return interaction.showModal(modal)
        }

        const preset = CHASEUP_PRESETS.find(p => p.id === value)
        if (!preset) return interaction.reply({ content: 'Unknown chase-up option.', ephemeral: true })

        const patch = { chaseUpOffset: preset.id === 'none' ? null : preset.ms }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }
}
