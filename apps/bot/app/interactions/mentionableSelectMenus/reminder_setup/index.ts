import Discord from 'discord.js'
import { getSession, updateSession } from 'lib/reminderSessions.ts'


export default async function (interaction: Discord.MentionableSelectMenuInteraction, args: string[]) {
    const sessionId = args[0]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    const who: string[] = []
    for (const user of interaction.users.values()) who.push(`<@${user.id}>`)
    for (const role of interaction.roles.values()) who.push(`<@&${role.id}>`)

    updateSession(sessionId, { who })

    return interaction.deferUpdate()
}
