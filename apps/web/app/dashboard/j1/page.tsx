import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDepartmentPermission } from '@/lib/orbat/hasDepartmentPermission'
import { DEPT_LINKS_MANAGE_KEY } from '@/lib/dept-links/keys'
import J1Panel from './J1Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = await hasPermission(me, 'departmentLeads.j1')
    const canManageLinks = canManageMembers || await hasDepartmentPermission(me, 'j1', DEPT_LINKS_MANAGE_KEY)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J1Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
}
