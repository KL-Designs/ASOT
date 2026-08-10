import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import CalendarPanel from './CalendarPanel'
import { hasPermission } from '@/lib/orbat/hasPermission'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const canWrite = client.hasRoles(me, PERMISSIONS.pages.admin)

    return (
        <CalendarPanel
            userId={me.id}
            displayName={displayName}
            isJ4={isJ4}
            canWrite={canWrite}
        />
    )
}
