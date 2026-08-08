import App from 'app'
import Db from 'lib/mongo.ts'


export default async function processRoles() {
    const guild = await App.guild()
    guild.roles.cache.forEach(r => {
        Db.roles.updateOne({ id: r.id }, { $set: { _id: r.id, ...r.toJSON() as Role } }, { upsert: true })
    })
}