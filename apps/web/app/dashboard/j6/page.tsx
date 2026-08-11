import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermissions } from '@/lib/orbat/hasPermissions'
import J6Panel from './J6Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j6)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const perms = await hasPermissions(me, ['departmentLeads.j6', 'deptLinks.manageJ6'])
    const canManageMembers = perms['departmentLeads.j6']
    const canManageLinks = canManageMembers || perms['deptLinks.manageJ6']
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J6Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
}
