import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import PeerReviewClient from './PeerReviewClient'
import { hasPermission } from '@/lib/orbat/hasPermission'

export const dynamic = 'force-dynamic'

export default async function PeerReviewPage({ params }: { params: Promise<{ roundId: string }> }) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/login')

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || 'Unknown'

    return <PeerReviewClient roundId={roundId} myUserId={me.id} myName={name} />
}
