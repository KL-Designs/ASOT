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

const otherServers = [
    { name: 'TeamSpeak', game: 'ts3', host: 'ts.asotmilsim.com', port: 9987 },
    { name: 'Minecraft', game: 'minecraft', host: '103.193.80.60', port: 25565 },
    { name: 'ARK', game: 'arkse', host: 'arma.asotmilsim.com', port: 27015 },
    //{ name: '7 Days to Die', game: '7d2d', host: 'arma.asotmilsim.com', port: 26900 },
    //{ name: 'Rust', game: 'rust', host: 'arma.asotmilsim.com', port: 28015 },
    //{ name: 'Project Zomboid', game: 'projectzomboid', host: 'arma.asotmilsim.com', port: 27016 },
    //{ name: 'Space Engineers', game: 'spaceengineers', host: 'arma.asotmilsim.com', port: 27017 },
    //{ name: 'DayZ', game: 'dayz', host: 'arma.asotmilsim.com', port: 2302 },
    //{ name: 'SCUM', game: 'scum', host: 'arma.asotmilsim.com', port: 27018 },
    { name: 'DCS World', game: 'dcs', host: 'arma.asotmilsim.com', port: 10308 },
    //{ name: 'Valheim', game: 'valheim', host: 'arma.asotmilsim.com', port: 2456 },
    //{ name: 'Stormworks', game: 'stormworks', host: 'arma.asotmilsim.com', port: 28016 },
    //{ name: 'ACC', game: 'assetto_corsa', host: 'arma.asotmilsim.com', port: 9600 },
    { name: 'FS22', game: 'farming_simulator22', host: 'arma.asotmilsim.com', port: 10823 },
    //{ name: 'Palworld', game: 'palworld', host: 'arma.asotmilsim.com', port: 7777 },
]

export default async function () {
    async function getStatus(list) {
        return Promise.all(list.map(async (s) => {
            try {
                const res = await GameDig.query({ type: s.game, host: s.host, port: s.port, socketTimeout: 3000 });
                
                // --- TRIM LOGIC ---
                // Decode URL chars, replace underscores with spaces, and grab only the first word
                let rawMode = decodeURIComponent(res.raw?.game || 'N/A').replace(/%20|_/g, ' ');
                let cleanMode = rawMode.split(/[ \-.]/)[0]; // Splits by space, dash, or dot and takes the first part

                return { ...s, status: true, players: res.numplayers, max: res.maxplayers, map: res.map, mode: cleanMode };
            } catch {
                return { ...s, status: false, players: 0, max: 0, map: 'N/A', mode: 'N/A' };
            }
        }));
    }

    const [armaResults, otherResults] = await Promise.all([getStatus(armaServers), getStatus(otherServers)]);

    // --- ARMA 3 EMBED ---
    const armaEmbed = new EmbedBuilder()
        .setTitle('🛰️ ASOT | ARMA 3 SERVERS')
        .setColor(App.colors.primary)
        .setDescription('📡 **Operational Status**\n\u200b');

    armaResults.forEach(server => {
        const emoji = server.status ? '🟢' : '🔴';
        const isAux = server.name.toLowerCase().includes('auxiliary');
        
        // Show Mode only for Aux servers, now with the trimmed "cleanMode"
        const info = server.status 
            ? `\`\`\`yaml\n${isAux ? `Mode: ${server.mode}\n` : ''}\nPop: ${server.players}/${server.max}\`\`\``
            : `\`\`\`diff\n- OFFLINE -\n \`\`\``;

        armaEmbed.addFields({ name: `${emoji} ${server.name}`, value: info, inline: true });
    });

    // --- OTHER SERVERS EMBED ---
    const otherEmbed = new EmbedBuilder()
        .setTitle('🎮 ASOT | OTHER SERVERS')
        .setColor('#5865F2')
        .setTimestamp()
        .setFooter({ text: 'Last Telemetry Update' });

    otherResults.forEach(server => {
        const emoji = server.status ? '🟢' : '🔴';
        const info = server.status 
            ? `\`\`\`yaml\nWorld: ${server.map}\nPop: ${server.players}/${server.max}\`\`\``
            : `\`\`\`diff\n- OFFLINE -\n \`\`\``;

        otherEmbed.addFields({ name: `${emoji} ${server.name}`, value: info, inline: true });
    });

    return { embeds: [armaEmbed.toJSON(), otherEmbed.toJSON()] };
}