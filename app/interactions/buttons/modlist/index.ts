import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { GenerateToken } from 'lib/encryption.ts'

import Modlist from '../../../commands/modlist/class.ts'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    console.log(args)

    const list = Modlist.fetchList(args[1])
    if (!list) interaction.reply({ content: 'Sorry, but this modlist no longer exists...', ephemeral: true })


    if (args[0] === 'list') {
        return interaction.reply({ content: `**${list.name} | Modlist**\n\`\`\`${list.mods.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n').slice(0, 2980)}\`\`\``, ephemeral: true })
    }

    if (args[0] === 'download') {
        if (!list.useOptionals) return interaction.reply({ files: [Modlist.createModFile(list.mods, list.name)], ephemeral: true })
        const foundOptionals = Modlist.matchOptionals(interaction.user.id)
        const merged = list.mods.concat(foundOptionals)

        return interaction.reply({ files: [Modlist.createModFile(merged, list.name)], ephemeral: true })
    }

    if (args[0] === 'optionals') {
        const User = await Db.users.findOne({ _id: interaction.user.id })
        if (!User) return interaction.reply('We failed to fetch your user, please try again later.\nIf the problem persists, talk to a staff member.')
        if (!User.token) {
            User.token = GenerateToken()
            Db.users.updateOne({ _id: User._id }, { $set: User }, { upsert: true })
        }

        interaction.reply({
            components: [
                new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                    .addComponents(
                        new Discord.ButtonBuilder()
                            .setEmoji('📝')
                            .setLabel('Configure Your Optionals')
                            .setStyle(Discord.ButtonStyle.Link)
                            .setURL(`http://localhost:3000/optionals/callback?token=${User.token}&info=DO_NOT_SHARE`)
                    )
            ],
            ephemeral: true
        })

        // const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)
        // const modOptions = Modlist.fetchOptionals().map(mod => ({
        //     label: mod.name,
        //     value: mod.id
        // }))

        // const row1 = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
        //     .addComponents(
        //         new Discord.StringSelectMenuBuilder()
        //             .setCustomId(`modlist.select`)
        //             .setMinValues(0)
        //             .setMaxValues(Modlist.fetchOptionals().length)
        //             .addOptions(modOptions)
        //     )

        // const row2 = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
        //     .addComponents(
        //         new Discord.ButtonBuilder()
        //             .setCustomId(`modlist.reset.${list.id}`)
        //             .setLabel('Disable all Optionals')
        //             .setStyle(Discord.ButtonStyle.Danger),

        //         new Discord.ButtonBuilder()
        //             .setCustomId(`modlist.all.${list.id}`)
        //             .setLabel('Enable all Optionals')
        //             .setStyle(Discord.ButtonStyle.Success)
        //     )

        // interaction.reply({
        //     content: `**Your Enabled Optionals**\n*Remember to press download!*\n\`\`\`${foundOptionals.join('\n').slice(0, 2980)}\`\`\``,
        //     components: [row1, row2],
        //     ephemeral: true
        // })
    }

    if (args[0] === 'reset') {
        Modlist.setUserOptionals(interaction.user.id, [])
        const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)
        interaction.update({ content: `**Your Enabled Optionals**\n*Remember to press download!*\n\`\`\`${foundOptionals.join('\n').slice(0, 2980)}\`\`\`` })
    }

    if (args[0] === 'all') {
        const allOptionals = Modlist.fetchOptionals().map(mod => mod.id)
        Modlist.setUserOptionals(interaction.user.id, allOptionals)
        const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)
        interaction.update({ content: `**Your Enabled Optionals**\n*Remember to press download!*\n\`\`\`${foundOptionals.join('\n').slice(0, 2980)}\`\`\`` })
    }

}