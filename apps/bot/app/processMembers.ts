import App from 'app'
import Db from 'lib/mongo.ts'
import Discord from 'discord.js'


// Also used by ready.ts for the setInterval that calls processMembers() on a schedule —
// shared so the "was this run recently" throttle below can never drift out of sync with it.
export const MEMBERS_SYNC_INTERVAL_MS = 1000 * 60 * 60

export async function processMember(member: Discord.GuildMember) {
    const user = await member.user.fetch()
    const userJson = user.toJSON()
    userJson['guild'] = member.toJSON()

    await Db.users.updateOne(
        { _id: user.id },
        { $set: userJson },
        { upsert: true }
    )

    console.log(`Processed member: ${user.tag}`)
}

export default async function processMembers() {
    // Skip if the last full sync is still within the interval — otherwise every bot
    // restart (crash, deploy, reconnect) re-processes the entire member list immediately,
    // even if one just ran moments ago.
    const last = await Db.data.findOne<SyncStateData>({ _id: 'membersLastSynced' })
    const elapsed = last ? Date.now() - last.timestamp : Infinity
    if (elapsed < MEMBERS_SYNC_INTERVAL_MS) {
        console.log(`Skipping member sync — last ran ${Math.round(elapsed / 1000)}s ago, next due in ~${Math.round((MEMBERS_SYNC_INTERVAL_MS - elapsed) / 1000)}s`)
        return
    }

    const guild = await App.guild()
    await guild.members.fetch()
    const members = guild.members.cache

    const batchSize = 10
    const delay = ms => new Promise(res => setTimeout(res, ms))

    const allMembers = Array.from(members.values())

    for (let i = 0; i < allMembers.length; i += batchSize) {
        const batch = allMembers.slice(i, i + batchSize)
        await Promise.allSettled(batch.map(m => processMember(m)))
        console.log(`Processed ${i + batch.length}/${allMembers.length} members`)
        await delay(2000)
    }

    await Db.data.updateOne(
        { _id: 'membersLastSynced' },
        { $set: { timestamp: Date.now() } },
        { upsert: true }
    )
}