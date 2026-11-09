import Discord, { ApplicationCommandOptionType } from 'discord.js'
import App from 'app'
import Db from 'lib/mongo.ts'
import { escapeRegex } from 'lib/escapeRegex.ts'
import { formatReminderTime } from 'lib/reminderDate.ts'

export default {
    name: 'admin',
    description: 'View and manage all reminders (admin role only)',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'search',
            description: 'Filter reminders by message text',
            type: ApplicationCommandOptionType.String,
            required: false,
        }
    ],

    async execute(interaction) {
        const member = interaction.member as Discord.GuildMember
        // Gated on DISCORD_ADMIN_ROLE_ID rather than a role name: it used to match
        // the name "J4-Administration" exactly, which locked out admins whose role
        // is spelled differently (e.g. "J4 - Administration").
        const adminRole = App.config.adminRole
        if (!adminRole || !member.roles.cache.has(adminRole)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true })
        }

        const search = escapeRegex(interaction.options.getString('search') || '')
        const query = search ? { message: { $regex: search, $options: 'i' } } : {}
        const reminders = await Db.reminders.find(query).sort({ expected: 1 }).limit(25).toArray()

        if (reminders.length === 0) {
            return interaction.reply({ content: 'No reminders found.', ephemeral: true })
        }

        const timezone = (await Db.users.findOne({ id: interaction.user.id }))?.timezone

        const options = reminders.map(r => {
            const creator = App.user(r.by)
            const creatorName = creator?.nickname || creator?.user.globalName || creator?.user.username || r.by
            const status = r.enabled === false ? '❌' : '✅'
            const label = `${status} ${r.message.length > 40 ? r.message.slice(0, 40) + '...' : r.message}`
            const description = `by ${creatorName} | ${formatReminderTime(r.expected, timezone)}`
            return {
                label,
                description: description.length > 100 ? description.slice(0, 97) + '...' : description,
                value: r._id.toString()
            }
        })

        const selectMenu = new Discord.StringSelectMenuBuilder()
            .setCustomId(`reminder_admin.${interaction.id}.select`)
            .setPlaceholder('Select a reminder to manage...')
            .addOptions(options)

        const row = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>()
            .addComponents(selectMenu)

        let content = `**All Reminders** — ${reminders.length} shown`
        if (reminders.length === 25) content += ' (max 25, use search to filter)'

        return interaction.reply({ content, components: [row], ephemeral: true })
    }
} as ChatSubcommand
