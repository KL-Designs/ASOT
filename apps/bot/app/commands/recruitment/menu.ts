import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'
import App from 'app'
import Cfg from 'configurations'

export default {
    name: 'Recruit Member 👋',
    type: ApplicationCommandType.User,
    dmPermission: false,

    async execute(interaction) {
        const channel = await App.channel(Cfg.recruiting.channel) as Discord.TextChannel
        const member = interaction.targetUser

        const message = await channel.send({
            embeds: [{
                title: 'Recruitment Process Started',
                description: `Recruitment process has been started for ${member}. Please follow the instructions in the thread.`,
                color: App.colors.primary
            }],

            components: [
                new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
                    .addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('recruitment.approve')
                            .setLabel('Approve & Recruit')
                            .setStyle(Discord.ButtonStyle.Secondary)
                            .setEmoji('✅'),

                        new Discord.ButtonBuilder()
                            .setCustomId('recruitment.reject')
                            .setLabel('Reject Recruitment')
                            .setStyle(Discord.ButtonStyle.Secondary)
                            .setEmoji('⛔'),
                    ),

                new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
                    .addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('recruitment.purge')
                            .setLabel('Purge Thread')
                            .setStyle(Discord.ButtonStyle.Danger)
                            .setEmoji('🗑️')
                    )
            ]
        })

        const thread = await message.startThread({
            name: `NEW RECRUIT | ${member.displayName || member.username}`,
            autoArchiveDuration: 10080
        })

        thread.send(`Welcome to the recruitment process, ${member}! Please follow the instructions provided in this thread.`)


        interaction.reply({
            content: `Recruitment process started for ${member}. Please check ${thread} for details.`,
            ephemeral: true
        })

    }

} as UserCommand