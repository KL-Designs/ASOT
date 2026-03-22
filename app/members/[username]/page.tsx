import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import MilpacEditor from './MilpacEditor'


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, ['J4-Administration'])) redirect('/me')

    const { username } = await params
    const allMembers = await client.fetchAllMembers()
    const member = allMembers.find(m => m.username === username)
    if (!member) notFound()

    return <MilpacEditor member={member} />
}
