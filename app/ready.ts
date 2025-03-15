import App from 'app'
import config from 'config'
import fs from 'node:fs'

import Discord from 'discord.js'
import Commands from 'discord/commands'

import { NumberWithCommas } from 'lib/util.ts'



export default async function (client: Discord.Client) {

    console.info(`App Logged in as ${client.user?.tag}`)

    await App.client.application?.commands.set(Commands).then(() => {
        console.table(Commands.map(c => ({
            name: c.name,
            description: c.description,
            subcommands: c.options?.map(o => o.name).join(', ') || 'N/A',
            dmPermission: c.dmPermission,
            type: c.type
        })))

        fs.writeFileSync('./commands.json', JSON.stringify(Commands, null, '\t'))
    })

    // let Status = true
    // const SwitchStatus = () => {
    //     client.user?.setPresence({
    //         status: 'online',
    //         activities: [{
    //             type: Discord.ActivityType.Watching,
    //             name: Status ? `${NumberWithCommas(client.guilds.cache.get(config.discord.guild)?.memberCount || 0)} Members` : `Message me for help!`
    //         }]
    //     }), Status = !Status
    // }
    // setInterval(SwitchStatus, 1000 * 15), SwitchStatus()

}