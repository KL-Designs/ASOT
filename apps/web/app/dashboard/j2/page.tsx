import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import J2Panel from './J2Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j2)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = await hasPermission(me, 'departmentLeads.j2')
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J2Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} isJ4={isJ4} />
}
