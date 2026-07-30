import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import PeerReviewClient from './PeerReviewClient'

export const dynamic = 'force-dynamic'

export default async function PeerReviewPage({ params }: { params: Promise<{ roundId: string }> }) {
    const { roundId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) redirect('/login')

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || 'Unknown'

    return <PeerReviewClient roundId={roundId} myUserId={me.id} myName={name} />
}
