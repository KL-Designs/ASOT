import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermissions } from '@/lib/orbat/hasPermissions'
import J4AdminPanel from './J4AdminPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) redirect('/dashboard')

    const perms = await hasPermissions(me, ['departmentLeads.j4', 'deptLinks.manageJ4'])
    const canManageLinks = perms['departmentLeads.j4'] || perms['deptLinks.manageJ4']

    return <J4AdminPanel userId={me.id} displayName={me.name ?? me.globalName ?? me.id} canManageLinks={canManageLinks} />
}
