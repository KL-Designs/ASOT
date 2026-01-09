import App from 'app'
import Db from 'lib/mongo.ts'


export default async function processMembers() {
    const guild = await App.guild()
    await guild.members.fetch()
    const members = guild.members.cache.filter(m => m.roles.cache.has(App.config.memberRole))

    const batchSize = 10
    const delay = ms => new Promise(res => setTimeout(res, ms))

    const allMembers = Array.from(members.values())

    for (let i = 0; i < allMembers.length; i += batchSize) {
        const batch = allMembers.slice(i, i + batchSize)

        // Fetch user info concurrently, but only for this batch
        const users = await Promise.allSettled(batch.map(m => m.user.fetch()))

        // Save to DB
        for (const result of users) {
            if (result.status === 'fulfilled') {
                const user = result.value
                let userJson = user.toJSON()
                userJson['guild'] = guild.members.cache.get(user.id).toJSON()

                await Db.users.updateOne(
                    { _id: user.id },
                    { $set: userJson },
                    { upsert: true }
                )
            }
        }

        console.log(`Processed ${i + batch.length}/${allMembers.length} members`)
        await delay(2000)
    }
}