import Discord from 'discord.js'

import Modlist from '../../../commands/modlist/class.ts'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const list = Modlist.fetchList(args[1])


    if (args[0] === 'list') {
        return interaction.reply({ content: `**${list.name} | Modlist**\n\`\`\`${list.mods.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n')}\`\`\``, ephemeral: true })
    }

    if (args[0] === 'download') {
        if (!list.useOptionals) return interaction.reply({ files: [Modlist.createModFile(list.mods, list.name)], ephemeral: true })
        const foundOptionals = Modlist.matchOptionals(interaction.user.id)
        const merged = list.mods.concat(foundOptionals)

        return interaction.reply({ files: [Modlist.createModFile(merged, list.name)], ephemeral: true })
    }

    if (args[0] === 'optionals') {
        const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)
        const modOptions = Modlist.fetchOptionals().map(mod => ({
            label: mod.name,
            value: mod.id
        }))

        const row1 = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
            .addComponents(
                new Discord.StringSelectMenuBuilder()
                    .setCustomId(`modlist.select`)
                    .setMinValues(0)
                    .setMaxValues(Modlist.fetchOptionals().length)
                    .addOptions(modOptions)
            )

        const row2 = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`modlist.reset`)
                    .setLabel('Remove all Optionals')
                    .setStyle(Discord.ButtonStyle.Danger)
            )

        interaction.reply({
            content: `**Your Enabled Optionals**\n\`\`\`${foundOptionals.join('\n')}\`\`\``,
            components: [row1, row2],
            ephemeral: true
        })
    }

    if (args[0] === 'reset') {
        Modlist.setUserOptionals(interaction.user.id, [])
        const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)
        interaction.update({ content: `**Your Enabled Optionals**\n\`\`\`${foundOptionals.join('\n')}\`\`\`` })
    }

}