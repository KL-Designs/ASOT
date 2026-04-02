import Discord, { ApplicationCommandOptionType, SelectMenuDefaultValueType } from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { createSession } from 'lib/reminderSessions.ts'


export default {
    name: 'edit',
    description: 'Edit an existing reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'reminder',
            description: 'The reminder to edit',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            async response(interaction) {
                const search = interaction.options.getString('reminder') || ''
                const reminders = await Db.reminders.find({ by: interaction.user.id, message: { $regex: search, $options: 'i' } }).limit(25).toArray()
                interaction.respond(reminders.map(r => ({
                    name: (r.message.length > 50 ? `${r.message.slice(0, 50)}... | ` : r.message + ' | ') + new Date(r.expected).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }),
                    value: r._id.toString()
                })))
            }
        } as AutocompleteOption,
        {
            name: 'time',
            description: 'New time (HH:MM), leave blank to keep current',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('time') || ''
                const [hours, minutes] = search.split(':').map(Number)
                if (!/^\d{2}:\d{2}$/.test(search)) return interaction.respond([{ name: 'Invalid Time, Must match HH:MM', value: 'invalid' }])
                if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return interaction.respond([{ name: 'Invalid Time, hours must be 00-23 and minutes 00-59', value: 'invalid' }])
                const date = new Date()
                date.setHours(hours)
                date.setMinutes(minutes)
                date.setSeconds(0)
                interaction.respond([{ name: date.toTimeString(), value: search }])
            }
        } as AutocompleteOption,
        {
            name: 'date',
            description: 'New date (DD/MM/YYYY), leave blank to keep current',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('date') || ''
                const [day, month, year] = search.split('/').map(Number)
                if (!/^\d{2}\/\d{2}\/\d{4}$/.test(search)) return interaction.respond([{ name: 'Invalid Date, Must match DD/MM/YYYY', value: 'invalid' }])
                if (!isRealDate(search)) return interaction.respond([{ name: `${search} is not a real date`, value: 'invalid' }])
                const date = new Date()
                date.setDate(day)
                date.setMonth(month - 1)
                date.setFullYear(year)
                interaction.respond([{ name: date.toDateString(), value: search }])
            }
        } as AutocompleteOption,
        {
            name: 'repeat',
            description: 'New repeat interval (m/h/d/w), leave blank to keep current',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('repeat') || ''
                const times = search.split('/')
                const finalRepeat = []
                for (const time of times) {
                    const value = Number(time.slice(0, -1))
                    const type = time.slice(-1)
                    if (isNaN(value)) return interaction.respond([{ name: 'Invalid Repeat Syntax', value: 'invalid' }])
                    switch (type) {
                        case 'm': finalRepeat.push(`${value} minutes`); break
                        case 'h': finalRepeat.push(`${value} hours`); break
                        case 'd': finalRepeat.push(`${value} days`); break
                        case 'w': finalRepeat.push(`${value} weeks`); break
                        default: return interaction.respond([{ name: `Invalid Repeat Syntax Letter: "${type}"`, value: 'invalid' }])
                    }
                }
                interaction.respond([{ name: `Repeat every ${finalRepeat.reverse().join(', ')}`, value: search }])
            }
        } as AutocompleteOption,
    ],

    async execute(interaction) {
        if (interaction.options.getString('time') === 'invalid') return interaction.reply({ content: 'Time is Invalid', ephemeral: true })
        if (interaction.options.getString('date') === 'invalid') return interaction.reply({ content: 'Date is Invalid', ephemeral: true })
        if (interaction.options.getString('repeat') === 'invalid') return interaction.reply({ content: 'Repeat is Invalid', ephemeral: true })

        const reminderId = interaction.options.getString('reminder', true)
        const reminder = await Db.reminders.findOne({ _id: new ObjectId(reminderId) })

        if (!reminder) return interaction.reply({ content: 'Reminder not found.', ephemeral: true })
        if (reminder.by !== interaction.user.id) return interaction.reply({ content: 'You can only edit your own reminders.', ephemeral: true })

        const sessionId = interaction.id

        // Use new values from options, or fall back to current reminder values
        const expected = new Date(reminder.expected)
        const currentTime = `${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`
        const currentDate = `${String(expected.getDate()).padStart(2, '0')}/${String(expected.getMonth() + 1).padStart(2, '0')}/${expected.getFullYear()}`

        const time = interaction.options.getString('time') ?? currentTime
        const date = interaction.options.getString('date') ?? currentDate
        const repeat = interaction.options.getString('repeat') ?? reminder.repeatRaw ?? null

        // Split who into pingMe + extras
        const selfMention = `<@${interaction.user.id}>`
        const pingMe = reminder.who.includes(selfMention)
        const who = reminder.who.filter(m => m !== selfMention)

        // Re-derive chase-up time/date strings from the stored offset
        let chaseUpTime: string | null = null
        let chaseUpDate: string | null = null
        if (reminder.chaseUpOffset !== null) {
            const chaseUpDatetime = new Date(expected.getTime() + reminder.chaseUpOffset)
            chaseUpTime = `${String(chaseUpDatetime.getHours()).padStart(2, '0')}:${String(chaseUpDatetime.getMinutes()).padStart(2, '0')}`
            chaseUpDate = `${String(chaseUpDatetime.getDate()).padStart(2, '0')}/${String(chaseUpDatetime.getMonth() + 1).padStart(2, '0')}/${chaseUpDatetime.getFullYear()}`
        }

        createSession(sessionId, {
            editId: reminderId,
            message: reminder.message,
            time,
            date,
            repeat,
            chaseUpTime,
            chaseUpDate,
            channel: reminder.channel,
            userId: interaction.user.id,
            pingMe,
            who,
        })

        // Pre-fill select menu with current who (excluding self)
        const defaultValues = who.map(mention => {
            if (mention.startsWith('<@&')) {
                return { id: mention.slice(3, -1), type: SelectMenuDefaultValueType.Role }
            }
            return { id: mention.slice(2, -1), type: SelectMenuDefaultValueType.User }
        })

        const selectMenu = new Discord.MentionableSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.select`)
            .setPlaceholder('Select who to remind...')
            .setMinValues(0)
            .setMaxValues(20)
            .setDefaultValues(defaultValues)

        const pingMeButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.pingme`)
            .setLabel(pingMe ? 'Ping Me: Yes' : 'Ping Me: No')
            .setEmoji(pingMe ? '✅' : '❌')
            .setStyle(pingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

        const chaseUpButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.chaseup`)
            .setLabel(chaseUpTime ? 'Chase Up Set' : 'Set Chase Up')
            .setEmoji('⏰')
            .setStyle(chaseUpTime ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Secondary)

        const confirmButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.confirm`)
            .setLabel('Save Changes')
            .setEmoji('💾')
            .setStyle(Discord.ButtonStyle.Primary)

        const selectRow = new Discord.ActionRowBuilder<Discord.MentionableSelectMenuBuilder>()
            .addComponents(selectMenu)
        const buttonRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
            .addComponents(pingMeButton, chaseUpButton, confirmButton)

        let content = `**Editing:** ${reminder.message}\n**Time:** ${time} | **Date:** ${date}`
        if (repeat) content += ` | **Repeat:** ${repeat}`
        if (chaseUpTime && reminder.chaseUpOffset !== null) {
            const chaseUpTs = Math.floor((expected.getTime() + reminder.chaseUpOffset) / 1000)
            content += `\n⏰ **Chase Up:** <t:${chaseUpTs}:F>`
        }
        content += `\nAdjust who to remind, then save.`

        return interaction.reply({ content, components: [selectRow, buttonRow], ephemeral: true })
    }
} as ChatSubcommand


function isRealDate(str: string): boolean {
    const [day, month, year] = str.split('/').map(Number)
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
