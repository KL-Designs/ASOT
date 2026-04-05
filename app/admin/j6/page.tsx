import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import J6Panel from './J6Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j6)) redirect('/admin')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j6)

    return <J6Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} />
}
