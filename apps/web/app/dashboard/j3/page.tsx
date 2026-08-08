import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import J3Panel from './J3Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j3)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j3)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return <J3Panel displayName={displayName} userId={me.id} canManageMembers={canManageMembers} isJ4={isJ4} />
}
