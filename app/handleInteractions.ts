import Discord from 'discord.js'

import ChatCommands from 'discord/commands'
import Buttons from 'discord/buttons'
import Modals from 'discord/modals'
import StringSelectMenus from 'discord/stringSelectMenus'



export function Commands(interaction: Discord.ChatInputCommandInteraction) {

    try {
        let command = ChatCommands.find(c => c.name === interaction.commandName)
        if (!command) throw new Error(`No command matching "${interaction.commandName}" was found.`)

        let path: string[] = []
        let map = interaction.options.data

        while (map.find(o => o.type === 1) || map.length !== 0) {
            const subcommand = map.find(o => o.type === 2 || o.type === 1)?.name as string
            path.push(subcommand)

            map = map.find(o => o.type === 2 || o.type === 1)?.options || []
        }

        path = path.filter(p => p !== undefined)

        while (path.length > 0) {
            if (!command) throw new Error(`No subcommand matching ${path.join(' ')} was found.`)
            command = command?.options?.find(c => c.name === path[0]) as any
            path.shift()
        }

        if (!command?.execute) throw new Error(`Subcommand "${command?.name || 'UNKNOWN'}" does not contain an executable.`)

        return command.execute(interaction)
    }

    catch (error: any) {
        return interaction.reply({ content: error.message, ephemeral: true })
    }
}


export function Autocomplete(interaction: Discord.AutocompleteInteraction) {

    try {
        let command = ChatCommands.find(c => c.name === interaction.commandName)
        if (!command) throw new Error(`No command matching "${interaction.commandName}" was found.`)

        const path: string[] = []
        let map = interaction.options.data

        while (map.find(o => o.type === 1) || map.length > 0) {
            const subcommand = map.find(o => o.type === 2 || o.type === 1 || o.type === 3)?.name as string
            path.push(subcommand)

            map = map.find(o => o.type === 2 || o.type === 1)?.options || []
        }

        while (path.length > 0) {
            if (!command) throw new Error(`No subcommand matching ${path.join(' ')} was found.`)
            command = command?.options?.find(c => c.name === path[0]) as any
            path.shift()
        }

        if (!command) throw new Error(`No autocomplete matching ${path.join(' ')} was found.`)
        const option = (command as any) as AutocompleteOption

        if (!option.response) throw new Error(`Autocomplete "${command?.name || 'UNKNOWN'}" does not contain a response.`)

        return option.response(interaction)
    }

    catch (error: any) {
        console.warn(error.message)
        return interaction.respond([])
    }
}



export function Button(interaction: Discord.ButtonInteraction) {
    const ext = interaction.customId.split('.')[0]
    const args = interaction.customId.split('.').slice(1)

    try {
        return Buttons[ext](interaction, args)
    } catch {
        return interaction.reply({ content: `No ButtonID matching \`${ext}\` was found.`, ephemeral: true })
    }
}


export function ModalSubmit(interaction: Discord.ModalSubmitInteraction) {
    const ext = interaction.customId.split('.')[0]
    const args = interaction.customId.split('.').slice(1)

    try {
        return Modals[ext](interaction, args)
    } catch {
        return interaction.reply({ content: `No ModalSubmitID matching \`${ext}\` was found.`, ephemeral: true })
    }
}


export function StringSelectMenu(interaction: Discord.StringSelectMenuInteraction) {
    const ext = interaction.customId.split('.')[0]
    const args = interaction.customId.split('.').slice(1)
    const channel = interaction.channel as Discord.TextChannel

    if (!channel) return interaction.reply({ content: `This interaction is not valid in this context.`, ephemeral: true })

    try {
        return StringSelectMenus[ext](interaction, args)
    } catch {
        return interaction.reply({ content: `No StringSelectMenu matching \`${ext}\` was found.`, ephemeral: true })
    }
}