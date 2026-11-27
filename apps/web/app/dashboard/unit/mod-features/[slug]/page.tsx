import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadVisibleModWikiArticles } from '@/lib/mod-wiki/store'
import { ModWikiPage } from '@/components/mod-wiki/ModWikiPage'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ slug: string }> }

export default async function Page({ params }: Props) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/me')

    const { slug } = await params
    const viewer = await resolveModWikiViewer()
    const articles = await loadVisibleModWikiArticles(viewer.canReview)

    return <ModWikiPage initialData={{ viewer, articles }} slug={slug} />
}
