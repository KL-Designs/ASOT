import Discord, { SelectMenuDefaultValueType } from 'discord.js'
import { ReminderSession } from 'lib/reminderSessions.ts'
import { TIME_PRESETS, REPEAT_PRESETS, CHASEUP_PRESETS } from 'lib/reminderDate.ts'


export function buildReminderComponents(sessionId: string, session: ReminderSession) {
    const timeRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
        ...TIME_PRESETS.map(preset =>
            new Discord.ButtonBuilder()
                .setCustomId(`reminder_setup.${sessionId}.time.${preset.id}`)
                .setLabel(preset.label)
                .setStyle(Discord.ButtonStyle.Secondary)
        ),
        new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.timecustom`)
            .setLabel('Custom time…')
            .setStyle(Discord.ButtonStyle.Secondary)
    )

    // Pre-fill the who-select with the reminder's existing recipients (edit flow) so
    // re-opening it doesn't silently drop them when the session is next saved — the
    // handler in mentionableSelectMenus/reminder_setup replaces session.who wholesale
    // with whatever the select shows as selected at submit time. Empty for a fresh
    // /reminder create session, where session.who starts as [].
    const whoDefaultValues = session.who.map(mention => {
        if (mention.startsWith('<@&')) {
            return { id: mention.slice(3, -1), type: SelectMenuDefaultValueType.Role }
        }
        return { id: mention.slice(2, -1), type: SelectMenuDefaultValueType.User }
    })

    const whoRow = new Discord.ActionRowBuilder<Discord.MentionableSelectMenuBuilder>().addComponents(
        new Discord.MentionableSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.select`)
            .setPlaceholder('Select who to remind... (leave empty for just yourself)')
            .setMinValues(0)
            .setMaxValues(20)
            .setDefaultValues(whoDefaultValues as any)
    )

    const repeatRow = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
        new Discord.StringSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.repeat`)
            .setPlaceholder(session.repeatLabel ? `Repeat: ${session.repeatLabel}` : 'Repeat: None')
            .addOptions(
                ...REPEAT_PRESETS.map(p => new Discord.StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id)),
                new Discord.StringSelectMenuOptionBuilder().setLabel('Custom…').setValue('custom')
            )
    )

    const chaseUpRow = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
        new Discord.StringSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.chaseup`)
            .setPlaceholder(session.chaseUpOffset !== null ? 'Chase Up: Set' : 'Chase Up: None')
            .addOptions(
                ...CHASEUP_PRESETS.map(p => new Discord.StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id)),
                new Discord.StringSelectMenuOptionBuilder().setLabel('Custom…').setValue('custom')
            )
    )

    const pingMeButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.pingme`)
        .setLabel(session.pingMe ? 'Ping Me: Yes' : 'Ping Me: No')
        .setEmoji(session.pingMe ? '✅' : '❌')
        .setStyle(session.pingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

    const confirmButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.confirm`)
        .setLabel(session.editId ? 'Save Changes' : 'Create Reminder')
        .setEmoji(session.editId ? '💾' : '🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    const actionRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(pingMeButton, confirmButton)

    return [timeRow, whoRow, repeatRow, chaseUpRow, actionRow]
}
