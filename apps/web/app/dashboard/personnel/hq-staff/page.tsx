import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import AllStaffPanel from '../all-staff/AllStaffPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.members)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    return <AllStaffPanel userId={me.id} displayName={displayName} title='HQ Staff' />
}
