import App from 'app'

import Discord from 'discord.js'



export default function (member: Discord.GuildMember | Discord.PartialGuildMember) {

    if (!member.roles.cache.has(App.config.memberRole)) return

    const channel = App.channel(App.config.notificationChannel) as Discord.TextChannel
    channel.send({
        content: `<@&${App.config.adminRole}>`,
        embeds: [
            {
                title: 'ASOT Member has Left the Discord',
                color: App.colors.danger,
                fields: [
                    { name: 'Nickname', value: member.nickname || member.user.globalName },
                    { name: 'Username', value: member.user.username },
                    { name: 'Discord ID', value: member.id },
                ],
                thumbnail: {
                    url: member.user?.displayAvatarURL({
                        size: 256,
                        extension: 'png',
                        forceStatic: false,
                    }) ?? undefined
                }
            }
        ]
    })

}