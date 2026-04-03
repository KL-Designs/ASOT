import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import PlaceholderPanel from '../PlaceholderPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j6)) redirect('/admin')

    return (
        <PlaceholderPanel
            title='J6 — Game Masters'
            description='Game master tools and scenario management are coming soon.'
        />
    )
}
