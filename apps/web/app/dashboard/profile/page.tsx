import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import ProfileScreen from './ProfileScreen'
import { resolveProfile } from './resolve'

export default async function Page() {
    await connection()

    const me = await client.fetchMe()
    if (!me) redirect('/login')

    // No gate of its own: the dashboard layout already turned away anyone
    // without standing, and everyone it lets through has a profile.
    return <ProfileScreen {...await resolveProfile(me)} />
}
