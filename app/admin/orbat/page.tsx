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

    const canManageStructure      = client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)
    const canManageMembers        = client.hasRoles(me, PERMISSIONS.admin.manageOrbatMembers)
    const canMilpacEditRestricted = client.hasRoles(me, PERMISSIONS.members.editRestricted)
    const canMilpacEditStandard   = client.hasRoles(me, PERMISSIONS.members.editStandard)

    const allUsers = (await Db.users.find({}).toArray()).map(u => ({
        id: u._id,
        username: u.username,
        displayName: (u.milpac?.currentRank ? u.milpac.currentRank + ' ' : '') + (u.name || u.globalName || u.username),
        avatarURL: u.guild?.avatarURL || u.avatarURL || '',
    }))

    return (
        <OrbatManager
            initialUsers={allUsers}
            canManageStructure={canManageStructure}
            canManageMembers={canManageMembers}
            canMilpacEditRestricted={canMilpacEditRestricted}
            canMilpacEditStandard={canMilpacEditStandard}
        />
    )
}
