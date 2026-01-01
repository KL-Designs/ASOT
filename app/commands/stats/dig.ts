import App from 'app'
import { GameDig } from 'npm:gamedig'
import { EmbedBuilder } from 'discord.js'


const servers = [
    { name: 'Main Ops', game: 'arma3', host: 'arma.asotmilsim.com', port: 4000 },
    { name: 'Gun Range', game: 'arma3', host: 'arma.asotmilsim.com', port: 4050 },
    { name: 'Training - Primary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4100 },
    { name: 'Training - Secondary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4108 },
    { name: 'Primary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4150 },
    { name: 'Secondary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4158 },
    { name: 'Tertiary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4166 },
    { name: 'Medical Camp', game: 'arma3', host: 'arma.asotmilsim.com', port: 4058 },
]


export default async function () {

    const output: { name: string, status: boolean, players: number | null, maxPlayers: number | null, map: string | null }[] = []

    for (const server of servers) {
        await GameDig.query({
            type: server.game,
            host: server.host,
            port: server.port,
        })
            .then(res => output.push({ name: server.name, status: true, players: res.numplayers, maxPlayers: res.maxplayers, map: res.map }))
            .catch(err => output.push({ name: server.name, status: false, players: null, maxPlayers: null, map: null }))
    }

    const embed = new EmbedBuilder()
        .setTitle('📊 Game Server Status')
        .setColor(App.colors.primary)
        .setTimestamp()
        .setFields(
            {name: 'Arma 3', value: output.map(server => `${server.status ? '🟢' : '🟥'} ${server.name} ‎ | ‎ ${server.players !== null ? `${server.players} / ${server.maxPlayers} Players` : 'Server Offline'}`).join('\n\n')}
        )

    return embed
}