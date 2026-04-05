import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import CalendarPanel from './CalendarPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    return (
        <CalendarPanel
            userId={me.id}
            displayName={displayName}
            isJ4={isJ4}
        />
    )
}
