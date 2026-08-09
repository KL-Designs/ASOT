//! This was Assassin's Idea :P


import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import DriversLicense from './DriversLicense'

export default async function Page() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, ['1-2'])) redirect('/')

    const canEdit = client.hasRoles(me, ['1-2-0 Command'])
    return <DriversLicense canEdit={canEdit} />
}
