import App from 'app'
import Discord from 'discord.js'
import Modlist from '../../../commands/modlist/class.ts'


export default async function Menu(interaction: Discord.StringSelectMenuInteraction, args: string[]) {

    if (args[0] === 'select') {
        Modlist.setUserOptionals(interaction.user.id, interaction.values)

        const foundOptionals = Modlist.matchOptionals(interaction.user.id).map((m, i) => `${i + 1} | ${m.id} | ${m.name}`)

        interaction.update({ content: `**Your Enabled Optionals**\n\`\`\`${foundOptionals.join('\n')}\`\`\`` })
    }

}