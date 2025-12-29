import App from 'app'
import { GameDig } from 'npm:gamedig'
import { EmbedBuilder } from 'discord.js'


const servers = [
    { name: 'Main Ops', port: 4000 },
    { name: 'Gun Range', port: 4050 },
    { name: 'Training - Primary', port: 4100 },
    { name: 'Training - Secondary', port: 4108 },
    { name: 'Primary Auxiliary', port: 4150 },
    { name: 'Secondary Auxiliary', port: 4158 },
    { name: 'Tertiary Auxiliary', port: 4166 },
    { name: 'Medical Camp', port: 4058 },
]


export default async function () {

    const output: { name: string, status: boolean, players: number | null, maxPlayers: number | null }[] = []

    for (const server of servers) {
        await GameDig.query({
            type: "arma3",
            host: "arma.asotmilsim.com",
            port: server.port,
        })
            .then(res => output.push({ name: server.name, status: true, players: res.numplayers, maxPlayers: res.maxplayers }))
            .catch(err => output.push({ name: server.name, status: false, players: null, maxPlayers: null }))
    }

    const embed = new EmbedBuilder()
        .setTitle('Server Status')
        .setColor(App.colors.primary)
        .setDescription(output.map(server => `${server.status ? '🟢' : '🔴'} ${server.name} | ${server.players !== null ? `${server.players} / ${server.maxPlayers} Players` : 'Server Offline'}`).join('\n\n'))
        .setTimestamp()

    return embed
}