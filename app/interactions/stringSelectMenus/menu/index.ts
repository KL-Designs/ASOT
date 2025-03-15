import Discord from 'discord.js'



export default async function Menu(interaction: Discord.StringSelectMenuInteraction, args: string[]) {

    interaction.reply({ content: `Menu was activated!`, ephemeral: true })

}