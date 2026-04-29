import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import TasksPage from './TasksPage'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    const isElevated = client.hasRoles(me, PERMISSIONS.departments.j4)

    return (
        <TasksPage
            userId={me.id}
            displayName={me.guild?.displayName || me.guild?.nickname || me.globalName || me.username || me.id}
            isElevated={isElevated}
        />
    )
}
