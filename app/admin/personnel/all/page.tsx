import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import AllMembersPanel from './AllMembersPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.members)) redirect('/admin')

    const canEditRestricted = client.hasRoles(me, PERMISSIONS.members.editRestricted)
    const canEditStandard   = client.hasRoles(me, PERMISSIONS.members.editStandard)
    const canImpersonate    = client.hasRoles(me, PERMISSIONS.admin.impersonate)
    const isJ4              = client.hasRoles(me, PERMISSIONS.departments.j4)

    return (
        <AllMembersPanel
            canEditRestricted={canEditRestricted}
            canEditStandard={canEditStandard}
            canImpersonate={canImpersonate}
            isJ4={isJ4}
        />
    )
}
