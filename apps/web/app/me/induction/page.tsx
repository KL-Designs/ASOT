import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import InductionClient from './InductionClient'

export const metadata = { title: 'Member Induction' }

/**
 * Row 213, Part D: the website induction a new member is sent to. Under /me
 * because a recruit on day one usually cannot open the dashboard yet.
 */
export default async function Page() {
    await connection()
    const me = await client.fetchMe()
    if (!me) redirect('/login')
    return <InductionClient name={me.guild?.nickname || me.globalName || me.username || ''} />
}
