import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import TicketsPanel from './TicketsPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    const canActionJ3 = client.hasRoles(me, PERMISSIONS.tickets.actionJ3)
    const displayName = me.guild?.nickname || me.globalName || me.username || ''

    return <TicketsPanel canActionJ3={canActionJ3} displayName={displayName} />
}
