import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import J6Panel from './J6Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j6)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = await hasPermission(me, 'departmentLeads.j6')
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J6Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} isJ4={isJ4} />
}
