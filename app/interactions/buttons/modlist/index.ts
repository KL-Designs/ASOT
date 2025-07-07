import Discord from 'discord.js'

import Modlist from '../../../commands/modlist/class.ts'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const list = Modlist.fetchList(args[1])


    if (args[0] === 'list') {
        return interaction.reply({ content: `**${list.name} | Modlist**\n\`\`\`${list.mods.map((mod, index) => `${index + 1} | ${mod.id} | ${mod.name}`).join('\n')}\`\`\``, ephemeral: true })
    }

    if (args[0] === 'download') {
        if (!list.useOptionals) return interaction.reply({ files: [Modlist.createModFile(list.xml, list.name)], ephemeral: true })
    }

}