import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermissions } from '@/lib/orbat/hasPermissions'
import J1Panel from './J1Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const perms = await hasPermissions(me, ['departmentLeads.j1', 'deptLinks.manageJ1'])
    const canManageMembers = perms['departmentLeads.j1']
    const canManageLinks = canManageMembers || perms['deptLinks.manageJ1']
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J1Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
}
