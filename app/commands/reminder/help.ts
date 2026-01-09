import Discord, { ApplicationCommandOptionType } from 'discord.js'


export default {
    name: 'help',
    description: 'How to use reminders',
    type: ApplicationCommandOptionType.Subcommand,

    async execute(interaction) {
        interaction.reply({ embeds: [{
            title: '🛟 Reminder Help',
            description: `
            When setting a reminder the syntax allows m(minutes), h(hours), d(days), w(weeks) from the time of creating the reminder.
            So for example, you could enter \`30m/2h\` to set a reminder for 2 and a half hours from now. You may enter in any order and will ONLY accept whole numbers.
            `
        }], ephemeral: true })
    }
} as ChatSubcommand