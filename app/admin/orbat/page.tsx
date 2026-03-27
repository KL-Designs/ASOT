import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import OrbatManager from './OrbatManager'



export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) redirect('/admin')

    const allUsers = (await Db.users.find({}).toArray()).map(u => {
        const stripped = u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
        const parts = (stripped || u.globalName || u.username || '').split(' ')
        const parsedName = parts.length > 1 ? parts.slice(1).join(' ') : (stripped || u.globalName || u.username || '')
        return {
            id: u._id,
            username: u.username,
            displayName: u.name || parsedName,
            avatarURL: u.guild?.avatarURL || u.avatarURL || '',
        }
    })

    return <OrbatManager initialUsers={allUsers} />
}
