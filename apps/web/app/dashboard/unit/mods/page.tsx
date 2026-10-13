import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import ModsPanel from './ModsPanel'

export const metadata = { title: 'Mod Database' }

/**
 * `/dashboard/unit/mods` — the Mod Database. Open to every dashboard user to
 * read; who may edit is decided by `/api/mods` (J2 and J7), not here.
 */
export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/me')

    return <ModsPanel />
}
