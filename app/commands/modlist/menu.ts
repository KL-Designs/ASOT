import Discord, { ApplicationCommandOptionType } from 'discord.js'

import Modlist from './class.ts'


export default {
    name: 'menu',
    description: 'Create a menu for a Modlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'modlist',
            description: 'Enter modlist name',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const modlists = Modlist.fetchLists()

                const search = interaction.options.getString('modlist') || ''
                const results = modlists.filter(list => list.name.toLowerCase().includes(search.toLowerCase()))
                const options = results.map(list => ({ name: list.name, value: list.name }))

                interaction.respond(options)
            }
        } as AutocompleteOption
    ],

    execute(interaction) {
        try {
            const name = interaction.options.getString('modlist')
            const list = Modlist.fetchList(name)

            const embed = new Discord.EmbedBuilder()
                .setTitle(`${list.name}`)
                .setDescription(`>>> ${list.description}`)
                .setColor(Discord.resolveColor(list.color as Discord.ColorResolvable))
                .addFields([
                    { name: 'Mod Count', value: list.mods.length.toString(), inline: true },
                    { name: 'Optional Mods', value: list.useOptionals ? 'Available' : 'Unavailable', inline: true }
                ])
            if (list.banner) embed.setImage(list.banner)

            let buttons = [
                new Discord.ButtonBuilder()
                    .setCustomId(`modlist.download.${list.id}`)
                    .setLabel('Download')
                    .setStyle(Discord.ButtonStyle.Success)
                    .setEmoji('🗃️'),
                new Discord.ButtonBuilder()
                    .setCustomId(`modlist.list.${list.id}`)
                    .setLabel('Show Mods')
                    .setStyle(Discord.ButtonStyle.Primary)
                    .setEmoji('📜')
            ]

            if (list.useOptionals) buttons.push(
                new Discord.ButtonBuilder()
                    .setCustomId(`modlist.optionals.${list.id}`)
                    .setLabel('Configure Optionals')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setEmoji('⚙️')
            )

            const actionRow = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>().addComponents(buttons)

            interaction.channel.send({ embeds: [embed], components: [actionRow] })
            interaction.deferReply().then(() => interaction.deleteReply())
        }

        catch (e) {
            interaction.reply({ content: `An error occurred:\n${e.message}`, ephemeral: true })
        }
    }
} as ChatSubcommand