import App from 'app'
import { GameDig } from 'npm:gamedig'
import { EmbedBuilder } from 'discord.js'

const armaServers = [
    { name: 'Main Ops', game: 'arma3', host: 'arma.asotmilsim.com', port: 4000 },
    { name: 'Gun Range', game: 'arma3', host: 'arma.asotmilsim.com', port: 4050 },
    { name: 'Training - Primary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4100 },
    { name: 'Training - Secondary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4108 },
    { name: 'Primary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4150 },
    { name: 'Secondary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4158 },
    { name: 'Tertiary Auxiliary', game: 'arma3', host: 'arma.asotmilsim.com', port: 4166 },
    { name: 'Medical Camp', game: 'arma3', host: 'arma.asotmilsim.com', port: 4058 },
]

const varietyServers = [
    { name: 'Minecraft Survival', game: 'minecraft', host: 'mc.asotmilsim.com', port: 25565 },
    { name: 'Ark: Survival Evolved', game: 'arkse', host: 'ark.asotmilsim.com', port: 27015 },
]

export default async function () {
    async function getStatus(list) {
        return Promise.all(list.map(async (s) => {
            try {
                const res = await GameDig.query({ type: s.game, host: s.host, port: s.port });
                // Clean up %20 and other URL encoding from the mode string
                const cleanMode = decodeURIComponent(res.raw?.game || 'N/A').replace(/_/g, ' ');
                
                return { 
                    ...s, 
                    status: true, 
                    players: res.numplayers, 
                    max: res.maxplayers, 
                    map: res.map,
                    mode: cleanMode
                };
            } catch {
                return { ...s, status: false, players: 0, max: 0, map: 'N/A', mode: 'N/A' };
            }
        }));
    }

    const armaResults = await getStatus(armaServers);
    const varietyResults = await getStatus(varietyServers);

    const embed = new EmbedBuilder()
        .setTitle('🛰️ ASOT Server Status')
        .setColor(App.colors.primary)
        .setTimestamp()
        .setFooter({ text: 'Real-time telemetry • Updated every 5m' });

    // --- SECTION 1: ARMA 3 ---
    embed.addFields({ name: '**ARMA 3 SERVERS**', value: '\u200b' });
    
    armaResults.forEach(server => {
        const statusEmoji = server.status ? '🟢' : '🔴';
        
        // Logic: Only show mode for the Auxiliary servers
        const isAux = server.name.toLowerCase().includes('auxiliary');
        const modeLine = (server.status && isAux) ? `Mode: ${server.mode}\n` : '';
        
        const info = server.status 
            ? `\`\`\`yaml\n${modeLine}Map: ${server.map}\nPop: ${server.players}/${server.max}\`\`\``
            : `\`\`\`diff\n- OFFLINE -\n \`\`\``;

        embed.addFields({ name: `${statusEmoji} ${server.name}`, value: info, inline: true });
    });

    // --- SECTION 2: VARIETY ---
    embed.addFields({ name: '\u200b', value: '**OTHER GAMES**' });

    varietyResults.forEach(server => {
        const statusEmoji = server.status ? '🟢' : '🔴';
        const info = server.status 
            ? `\`\`\`yaml\nWorld: ${server.map}\nPop: ${server.players}/${server.max}\`\`\``
            : `\`\`\`diff\n- OFFLINE -\n \`\`\``;

        embed.addFields({ name: `${statusEmoji} ${server.name}`, value: info, inline: true });
    });

    return embed;
}