import Discord, { ApplicationCommandOptionType } from 'discord.js'
import { createSession } from 'lib/reminderSessions.ts'


export default {
    name: 'create',
    description: 'Create a New Reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'reminder',
            description: 'Whats the reminder for?',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'time',
            description: 'Use "/reminder help" to understand how to use this.',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('time') || ''

                const [hours, minutes] = search.split(":").map(Number)
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
            description: 'Leave Blank to set as today. Use "/reminder help" to understand how to use this. (DD-MM-YYYY)',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('date') || ''

                const [day, month, year] = search.split("/").map(Number)
                if (!/^\d{2}\/\d{2}\/\d{4}$/.test(search)) return interaction.respond([{ name: 'Invalid Date, Must match DD/MM/YYYY', value: 'invalid' }])
                if (!isRealDate(search)) return interaction.respond([{ name: `${search} is not a real date, please check this date exists!`, value: 'invalid' }])

                const date = new Date()
                date.setDate(day)
                date.setMonth(month - 1)
                date.setFullYear(year)

                interaction.respond([{ name: date.toDateString(), value: search }])
            }
        } as AutocompleteOption,
        {
            name: 'repeat',
            description: 'Repeat every X time after the initial chosen time and date, (m/h/d/w)',
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
                        case "m": finalRepeat.push(`${value} minutes`); break
                        case "h": finalRepeat.push(`${value} hours`); break
                        case "d": finalRepeat.push(`${value} days`); break
                        case "w": finalRepeat.push(`${value} weeks`); break
                        default: return interaction.respond([{ name: `Invalid Repeat Syntax Letter: "${type}"`, value: 'invalid' }])
                    }
                }

                interaction.respond([{ name: `Repeat every ${finalRepeat.reverse().join(', ')}`, value: search }])
            }

        } as AutocompleteOption,
    ],

    execute(interaction) {
        if (interaction.options.getString('date') === 'invalid') return interaction.reply({ content: 'Date is Invalid', ephemeral: true })
        if (interaction.options.getString('time') === 'invalid') return interaction.reply({ content: 'Time is Invalid', ephemeral: true })
        if (interaction.options.getString('repeat') === 'invalid') return interaction.reply({ content: 'Repeat is Invalid', ephemeral: true })

        const sessionId = interaction.id

        createSession(sessionId, {
            editId: null,
            message: interaction.options.getString('reminder', true),
            time: interaction.options.getString('time', true),
            date: interaction.options.getString('date', false) ?? '',
            repeat: interaction.options.getString('repeat', false),
            chaseUpTime: null,
            chaseUpDate: null,
            channel: interaction.channelId,
            userId: interaction.user.id,
            pingMe: true,
            who: [],
        })

        const selectMenu = new Discord.MentionableSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.select`)
            .setPlaceholder('Select who to remind... (leave empty for just yourself)')
            .setMinValues(0)
            .setMaxValues(20)

        const pingMeButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.pingme`)
            .setLabel('Ping Me: Yes')
            .setEmoji('✅')
            .setStyle(Discord.ButtonStyle.Success)

        const chaseUpButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.chaseup`)
            .setLabel('Set Chase Up')
            .setEmoji('⏰')
            .setStyle(Discord.ButtonStyle.Secondary)

        const confirmButton = new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.confirm`)
            .setLabel('Create Reminder')
            .setEmoji('🔔')
            .setStyle(Discord.ButtonStyle.Primary)

        const selectRow = new Discord.ActionRowBuilder<Discord.MentionableSelectMenuBuilder>()
            .addComponents(selectMenu)

        const buttonRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
            .addComponents(pingMeButton, chaseUpButton, confirmButton)

        interaction.reply({
            content: `**Reminder:** ${interaction.options.getString('reminder', true)}\nSelect who to remind, then confirm.`,
            components: [selectRow, buttonRow],
            ephemeral: true
        })
    }
} as ChatSubcommand



function isRealDate(str) {
    const [day, month, year] = str.split("/").map(Number)

    const date = new Date(year, month - 1, day)

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}
