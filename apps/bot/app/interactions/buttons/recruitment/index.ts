import Discord from 'discord.js'



export default async function (interaction: Discord.ButtonInteraction, args: string[]) {

    const thread = interaction.message.thread
    if (!thread) return interaction.reply('This message is not in a thread.')

    switch (args[0]) {
        case 'approve': thread.send('Recruitment approved!'); break;
        case 'reject': thread.send('Recruitment rejected!'); break;
        case 'purge': {
            try {
                thread.delete()
                interaction.message.delete()
            }
            catch (error) {
                return interaction.reply(error instanceof Error ? error.message : 'An error occurred while purging the thread.')
            }
        }
    }

    return interaction.deferReply({ ephemeral: true })
}