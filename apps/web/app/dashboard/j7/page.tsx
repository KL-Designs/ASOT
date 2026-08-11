import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermissions } from '@/lib/orbat/hasPermissions'
import J7Panel from './J7Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j7)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const perms = await hasPermissions(me, ['departmentLeads.j7', 'deptLinks.manageJ7'])
    const canManageMembers = perms['departmentLeads.j7']
    const canManageLinks = canManageMembers || perms['deptLinks.manageJ7']
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J7Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
}
