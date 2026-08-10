import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import SopsPanel from './SopsPanel'
import { hasPermission } from '@/lib/orbat/hasPermission'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    const isJ4 = client.hasRoles(me, PERMISSIONS.sops.manage)

    return <SopsPanel isJ4={isJ4} />
}
