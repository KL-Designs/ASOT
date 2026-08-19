import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import ProfileScreen from '@/app/dashboard/profile/ProfileScreen'
import { resolveProfile } from '@/app/dashboard/profile/resolve'

/**
 * The profile now lives at /dashboard/profile, inside the sidebar and on the
 * kit. Anyone who can open the dashboard is sent there.
 *
 * /me stays for the members who cannot: no department, no ORBAT position, no
 * reservist slot — a recruit on their first day. `hasDashboardAccess` turns
 * them away at the dashboard layout and lands them here, so this route renders
 * the same screen rather than redirecting into a page they'd bounce out of.
 * It is also where every `redirect('/me')` in the dashboard tree ends up.
 */
export default async function Page() {
    await connection()

    const me = await client.fetchMe()
    if (!me) redirect('/login')

    if (await hasDashboardAccess(me)) redirect('/dashboard/profile')

    return <ProfileScreen {...await resolveProfile(me)} />
}
