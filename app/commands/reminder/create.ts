import Discord, { ApplicationCommandOptionType } from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'


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
        {
            name: 'who',
            description: 'Who do you want to remind? (Leave blank to remind yourself)',
            type: ApplicationCommandOptionType.Mentionable,
            required: false
        }
    ],

    async execute(interaction) {
        if (interaction.options.getString('date') === 'invalid') return interaction.reply({ content: 'Date is Invalid', ephemeral: true })
        if (interaction.options.getString('time') === 'invalid') return interaction.reply({ content: 'Time is Invalid', ephemeral: true })
        if (interaction.options.getString('repeat') === 'invalid') return interaction.reply({ content: 'Repeat is Invalid', ephemeral: true })

        const who = []
        const finalDate = new Date()
        let repeat = 0

        who.push(`<@${interaction.user.id}>`)

        if (!interaction.options.getString('reminder', true)) return

        if (interaction.options.getMentionable('who')) {
            const mention = interaction.options.getMentionable('who') as Discord.GuildMember & Discord.Role
            if (mention) {
                if (mention.user) who.push(`<@${mention.user.id}>`)
                else if (mention.id) who.push(`<@&${mention.id}>`)
            }
        }

        const date = () => {
            if (interaction.options.getString('date', false)) return interaction.options.getString('date')
            const today = new Date()
            const dd = String(today.getDate()).padStart(2, '0')
            const mm = String(today.getMonth() + 1).padStart(2, '0')
            const yyyy = today.getFullYear()
            return `${dd}/${mm}/${yyyy}`
        }

        const [day, month, year] = date().split('/')
        finalDate.setDate(parseInt(day))
        finalDate.setMonth(parseInt(month) - 1)
        finalDate.setFullYear(parseInt(year))

        const [hour, minute] = interaction.options.getString('time', true).split(':')
        finalDate.setHours(parseInt(hour))
        finalDate.setMinutes(parseInt(minute))


        if (interaction.options.getString('repeat', false) !== null) {
            const rawRepeat = interaction.options.getString('repeat', false)

            const times = rawRepeat.split('/')
            repeat = 0

            times.forEach((time, i) => {
                const value = Number(time.slice(0, -1))
                const type = time.slice(-1)

                if (isNaN(value)) return interaction.reply({ content: 'Invalid Repeat Syntax', ephemeral: true })

                switch (type) {
                    case "m": repeat += 1000 * 60 * value; break
                    case "h": repeat += 1000 * 60 * 60 * value; break
                    case "d": repeat += 1000 * 60 * 60 * 24 * value; break
                    case "w": repeat += 1000 * 60 * 60 * 24 * 7 * value; break
                    default: return interaction.reply({ content: `Invalid Repeat Syntax Letter: "${type}"`, ephemeral: true }) //! THIS IS GONNA BREAK
                }
            })
        }

        Db.reminders.insertOne({
            _id: new ObjectId(),
            enabled: true,
            expected: finalDate,
            repeat: repeat,
            by: interaction.user.id,
            who: who,
            message: interaction.options.getString('reminder')
        })

        interaction.reply({ content: `Reminder set for <t:${Math.floor(finalDate.getTime() / 1000)}:F>\n>>> ${interaction.options.getString('reminder')}`, ephemeral: true })

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