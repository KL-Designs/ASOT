import Discord from 'discord.js'



export default async function Button1(interaction: Discord.ModalSubmitInteraction, args: string[]) {

    interaction.reply({ content: `Button1 was clicked!`, ephemeral: true })

}