import Discord, { ApplicationCommandOptionType } from 'discord.js'
import App from 'app'
import Db from 'lib/mongo.ts'

const ADMIN_ROLE = 'J4-Administration'

export default {
    name: 'admin',
    description: 'View and manage all reminders (J4-Administration only)',
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
        if (!member.roles.cache.some(r => r.name === ADMIN_ROLE)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true })
        }

        const search = interaction.options.getString('search') || ''
        const query = search ? { message: { $regex: search, $options: 'i' } } : {}
        const reminders = await Db.reminders.find(query).sort({ expected: 1 }).limit(25).toArray()

        if (reminders.length === 0) {
            return interaction.reply({ content: 'No reminders found.', ephemeral: true })
        }

        const options = reminders.map(r => {
            const creator = App.user(r.by)
            const creatorName = creator?.nickname || creator?.user.globalName || creator?.user.username || r.by
            const status = r.enabled === false ? '❌' : '✅'
            const label = `${status} ${r.message.length > 40 ? r.message.slice(0, 40) + '...' : r.message}`
            const description = `by ${creatorName} | ${new Date(r.expected).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
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
