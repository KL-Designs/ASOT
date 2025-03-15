import Discord from 'discord.js'



export default async function Button2(interaction: Discord.ModalSubmitInteraction, args: string[]) {

    interaction.reply({ content: `Button2 was clicked!`, ephemeral: true })

}