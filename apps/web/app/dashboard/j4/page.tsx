import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDepartmentPermission } from '@/lib/orbat/hasDepartmentPermission'
import { DEPT_LINKS_MANAGE_KEY } from '@/lib/dept-links/keys'
import J4AdminPanel from './J4AdminPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) redirect('/dashboard')

    const canManageLinks = (await hasPermission(me, 'departmentLeads.j4')) || await hasDepartmentPermission(me, 'j4', DEPT_LINKS_MANAGE_KEY)

    const [canBackupManage, canBackupRestore] = await Promise.all([
        hasPermission(me, 'backups.manage'),
        hasPermission(me, 'backups.restore'),
    ])

    return (
        <J4AdminPanel
            userId={me.id}
            displayName={me.name ?? me.globalName ?? me.id}
            canManageLinks={canManageLinks}
            canBackupManage={canBackupManage}
            canBackupRestore={canBackupRestore}
        />
    )
}
