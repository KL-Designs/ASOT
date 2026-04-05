import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getOrbatEntriesForUsers } from '@/lib/orbat'
import AllMembersPanel from './AllMembersPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.members)) redirect('/admin')

    const allMembers = await client.fetchAllMembers()

    const sorted = [...allMembers].sort((a, b) => {
        const nameA = a.name || a.guild?.nickname || a.globalName || a.username || ''
        const nameB = b.name || b.guild?.nickname || b.globalName || b.username || ''
        return nameA.localeCompare(nameB)
    })

    const orbatMap = await getOrbatEntriesForUsers(sorted.map(m => m.id))
    const canEditRestricted = client.hasRoles(me, PERMISSIONS.members.editRestricted)
    const canEditStandard   = client.hasRoles(me, PERMISSIONS.members.editStandard)
    const canImpersonate    = client.hasRoles(me, PERMISSIONS.admin.impersonate)

    return (
        <AllMembersPanel
            members={sorted}
            orbatMap={orbatMap}
            canEditRestricted={canEditRestricted}
            canEditStandard={canEditStandard}
            canImpersonate={canImpersonate}
        />
    )
}
