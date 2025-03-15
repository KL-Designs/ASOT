import Discord from 'discord.js'

declare global {
    export interface ChatCommand extends Discord.ChatInputApplicationCommandData {
        execute?: (interaction: Discord.ChatInputCommandInteraction) => void
    }

    export interface ChatSubcommand extends Discord.APIApplicationCommandSubcommandOption {
        execute?: (interaction: Discord.ChatInputCommandInteraction) => void
    }

    export interface ChatSubcommandGroup extends Discord.APIApplicationCommandSubcommandGroupOption {
        // execute?: (interaction: Discord.ChatInputCommandInteraction) => void
    }

    export interface AutocompleteOption extends Discord.ApplicationCommandAutocompleteStringOptionData {
        response?: (interaction: Discord.AutocompleteInteraction) => void
    }
}