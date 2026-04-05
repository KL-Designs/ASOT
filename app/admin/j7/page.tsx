import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import J7Panel from './J7Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j7)) redirect('/admin')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j7)

    return <J7Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} />
}
