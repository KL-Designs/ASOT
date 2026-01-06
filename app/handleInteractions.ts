import Discord from 'discord.js'

import { ChatCommands, UserContextCommands } from 'discord/commands'
import Buttons from 'discord/buttons'
import Modals from 'discord/modals'
import StringSelectMenus from 'discord/stringSelectMenus'



export function UserContextCommand(interaction: Discord.UserContextMenuCommandInteraction) {
    try {
        let command = UserContextCommands.find(c => c.name === interaction.commandName)
        if (!command) throw new Error(`No user context command matching "${interaction.commandName}" was found.`)

        let path: string[] = []
        let map = interaction.options.data

        while (map.find(o => o.type === 1) || map.length !== 0) {
            const subcommand = map.find(o => o.type === 2 || o.type === 1)?.name as string
            path.push(subcommand)

            map = map.find(o => o.type === 2 || o.type === 1)?.options || []
        }

        path = path.filter(p => p !== undefined)

        if (!command?.execute) throw new Error(`Subcommand "${command?.name || 'UNKNOWN'}" does not contain an executable.`)

        return command.execute(interaction)
    }

    catch (error: any) {
        return interaction.reply({ content: error.message, ephemeral: true })
    }
}

export function ChatCommand(interaction: Discord.ChatInputCommandInteraction) {
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
        const command = ChatCommands.find(c => c.name === interaction.commandName)
        if (!command) throw new Error(`No command matching "${interaction.commandName}" found.`)

        const focused = interaction.options.getFocused(true)
        if (!focused) throw new Error('No focused option found for autocomplete')

        const subcommandName = interaction.options.getSubcommand(false)
        let subcommand: any = command

        if (subcommandName) {
            const maybeSub = command.options?.find(o => o.name === subcommandName)
            if (!maybeSub || !('options' in maybeSub)) throw new Error(`Subcommand "${subcommandName}" not found or has no options.`)
            subcommand = maybeSub
        }

        const optionDef = subcommand.options.find((o: any) => o.name === focused.name)
        if (!optionDef) throw new Error(`No autocomplete matching "${focused.name}" found.`)
        if (!optionDef.response) throw new Error(`Autocomplete "${focused.name}" has no response function.`)

        return optionDef.response(interaction)
    } catch (error: any) {
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