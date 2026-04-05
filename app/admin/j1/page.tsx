import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import J1Panel from './J1Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) redirect('/admin')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J1Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} isJ4={isJ4} />
}
