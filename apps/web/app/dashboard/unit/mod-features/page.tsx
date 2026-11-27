import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadVisibleModWikiArticles } from '@/lib/mod-wiki/store'
import { ModWikiPage } from '@/components/mod-wiki/ModWikiPage'

export const metadata = { title: 'ASOT Mod & Features' }
export const dynamic = 'force-dynamic'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/me')

    const viewer = await resolveModWikiViewer()
    const articles = await loadVisibleModWikiArticles(viewer.canReview)

    return <ModWikiPage initialData={{ viewer, articles }} />
}
