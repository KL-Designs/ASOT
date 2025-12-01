import App from 'app'
import Db from 'lib/mongo.ts'

import Discord from 'discord.js'



export default async function (oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {

    const hadRole = oldMember.roles.cache.has(App.config.memberRole)
    const hasRole = newMember.roles.cache.has(App.config.memberRole)

    if (!hadRole && hasRole) {
        try {
            const user = await newMember.user.fetch()
            let userJson = user.toJSON()
            userJson['guild'] = newMember.toJSON()

            await Db.users.updateOne(
                { _id: user.id },
                { $set: userJson },
                { upsert: true }
            )

            console.log(`Processed member on role add: ${user.tag}`)
        } catch (err) {
            console.error('Error processing user on role add:', err)
        }
    }

}