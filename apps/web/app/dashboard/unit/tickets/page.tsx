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

    const canActionJ1 = client.hasRoles(me, PERMISSIONS.tickets.actionJ1)
    const canActionJ2 = client.hasRoles(me, PERMISSIONS.tickets.actionJ2)
    const canActionJ3 = client.hasRoles(me, PERMISSIONS.tickets.actionJ3)
    const canActionJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    const canActionJ6 = client.hasRoles(me, PERMISSIONS.tickets.actionJ6)
    const canActionJ7 = client.hasRoles(me, PERMISSIONS.tickets.actionJ7)
    const canActionMoveRequest = client.hasRoles(me, PERMISSIONS.tickets.actionMoveRequest)
    const canActionDiscipline = client.hasRoles(me, PERMISSIONS.tickets.actionDiscipline)

    // Members can see their dept's tickets but not action them
    const canSeeJ1 = canActionJ1 || client.hasRoles(me, PERMISSIONS.departments.j1)
    const canSeeJ2 = canActionJ2 || client.hasRoles(me, PERMISSIONS.departments.j2)
    const canSeeJ3 = canActionJ3 || client.hasRoles(me, PERMISSIONS.departments.j3)
    const canSeeJ4 = canActionJ4 || client.hasRoles(me, PERMISSIONS.departments.j4)
    const canSeeJ6 = canActionJ6 || client.hasRoles(me, PERMISSIONS.departments.j6)
    const canSeeJ7 = canActionJ7 || client.hasRoles(me, PERMISSIONS.departments.j7)

    const displayName = me.guild?.nickname || me.globalName || me.username || ''

    return (
        <TicketsPanel
            canActionJ1={canActionJ1}
            canActionJ2={canActionJ2}
            canActionJ3={canActionJ3}
            canActionJ4={canActionJ4}
            canActionJ6={canActionJ6}
            canActionJ7={canActionJ7}
            canActionMoveRequest={canActionMoveRequest}
            canActionDiscipline={canActionDiscipline}
            canSeeJ1={canSeeJ1}
            canSeeJ2={canSeeJ2}
            canSeeJ3={canSeeJ3}
            canSeeJ4={canSeeJ4}
            canSeeJ6={canSeeJ6}
            canSeeJ7={canSeeJ7}
            displayName={displayName}
            userId={me.id}
        />
    )
}
