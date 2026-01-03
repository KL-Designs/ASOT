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
    const results = await Promise.all(servers.map(async (server) => {
        try {
            const res = await GameDig.query({ type: server.game, host: server.host, port: server.port });
            return { ...server, status: true, players: res.numplayers, max: res.maxplayers, map: res.map };
        } catch {
            return { ...server, status: false, players: 0, max: 0, map: 'N/A' };
        }
    }));

    const embed = new EmbedBuilder()
        .setTitle('🛰️ ASOT Server Network Status')
        .setColor(App.colors.primary)
        .setTimestamp()
        .setFooter({ text: 'Status updates automatically' });

    results.forEach(server => {
        const statusEmoji = server.status ? '🟢' : '🔴';
        
        const info = server.status 
            ? `\`\`\`yaml\nMap: ${server.map}\nPop: ${server.players}/${server.max}\`\`\``
            : `\`\`\`diff\n- OFFLINE -\n \`\`\``;

        embed.addFields({ 
            name: `${statusEmoji} ${server.name}`, 
            value: info, 
            inline: true 
        });
    });

    return embed;
}