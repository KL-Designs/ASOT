import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'create',
    description: 'Create a New Reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
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

                if (!/^\d{2}-\d{2}-\d{4}$/.test(search)) return interaction.respond([{ name: 'Invalid Date, Must match DD-MM-YYYY', value: 'invalid' }])
                if (!isRealDate(search)) return interaction.respond([{ name: `${search} is not a real date, please check this date exists!`, value: 'invalid' }])



                interaction.respond([{ name: 'Invalid', value: 'invalid' }])
            }
        } as AutocompleteOption,
        {
            name: 'repeat',
            description: 'Repeat every X time after the initial chosen time and date, (s/m/h/d/w)',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('repeat') || ''

                if (search.includes('@')) {
                    const date = search.split('@')[0]
                    const time = search.split('@')[1]

                    if (!date || !time) return interaction.respond([{ name: 'Invalid Date/Time', value: 'invalid' }])

                    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) return interaction.respond([{ name: 'Invalid Date, Must match DD-MM-YYYY', value: 'invalid' }])
                    if (!isRealDate(date)) return interaction.respond([{ name: `${date} is not a real date, please check this date exists!`, value: 'invalid' }])

                    const [minutes, hours] = time.split(":").map(Number)
                    if (!/^\d{2}:\d{2}$/.test(time)) return interaction.respond([{ name: 'Invalid Time, Must match MM:HH', value: 'invalid' }])
                    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return interaction.respond([{ name: 'Invalid Time, hours must be 00-23 and minutes 00-59', value: 'invalid' }])
                }

                interaction.respond([{ name: 'Invalid', value: 'invalid' }])
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

    }
} as ChatSubcommand



function isRealDate(str) {
    const [day, month, year] = str.split("-").map(Number)

    const date = new Date(year, month - 1, day)

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}