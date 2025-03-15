import config from 'config'
import Discord from 'discord.js'

import Colors from 'lib/colors.ts'

import Events from 'discord/events'
import Modules from 'discord/modules'
import ready from './ready.ts'
import * as Handle from './handleInteractions.ts'


const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMembers,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.GuildPresences,
        Discord.GatewayIntentBits.GuildVoiceStates,

        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.DirectMessages,
    ],

    partials: [
        Discord.Partials.Channel,
    ]
})

client.login(config.discord.token).catch(console.error)


client.on('ready', ready)

client.on('interactionCreate', interaction => {
    if (interaction.isChatInputCommand()) return Handle.Commands(interaction)
    if (interaction.isAutocomplete()) return Handle.Autocomplete(interaction)
    if (interaction.isButton()) return Handle.Button(interaction)
    if (interaction.isModalSubmit()) return Handle.ModalSubmit(interaction)
    if (interaction.isStringSelectMenu()) return Handle.StringSelectMenu(interaction)
})

const originalEmit = client.emit.bind(client)
client.emit = function <K extends keyof Discord.ClientEvents>(event: K, ...args: Discord.ClientEvents[K]) {
    try {
        Events[event](...args)
    } catch {
        // No event handler
    }

    return originalEmit(event, ...args)
}

for (const mod in Modules) {
    try {
        Modules[mod](client)
        console.log(`Successfully mounted "${mod}"`)
        continue
    } catch {
        console.warn(`Failed to mount "${mod}", skipping...`)
        continue
    }
}



const DiscordController = {
    config: config.discord,
    colors: Colors,

    client: client || null,
    guild: () => client.guilds.cache.get(config.discord.guild) as Discord.Guild,
    channel: (data: string): Discord.GuildBasedChannel => {
        const guild = client.guilds.cache.get(config.discord.guild)
        if (!guild) throw new Error('Guild not found')
        return (guild.channels.cache.get(data) || guild.channels.cache.find(channel => channel.name === data)) as Discord.GuildBasedChannel
    },
    user: (id: string) => {
        const guild = client.guilds.cache.get(config.discord.guild)
        return guild?.members.cache.get(id) as Discord.GuildMember
    },
}

export default DiscordController