import Discord from 'discord.js'



export default async function Button3(interaction: Discord.ModalSubmitInteraction, args: string[]) {

    interaction.reply({ content: `Button3 was clicked!`, ephemeral: true })

}