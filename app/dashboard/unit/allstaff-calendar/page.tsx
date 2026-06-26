import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import AllStaffCalendarPanel from './AllStaffCalendarPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) redirect('/me')

    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)
    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)

    return (
        <AllStaffCalendarPanel
            userId={me.id}
            displayName={me.guild?.displayName ?? me.username ?? me.id}
            isTrainer={isTrainer}
            isJ3Lead={isJ3Lead}
        />
    )
}
