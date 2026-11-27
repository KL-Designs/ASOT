import { NextResponse } from 'next/server'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadVisibleModWikiArticles } from '@/lib/mod-wiki/store'

export const dynamic = 'force-dynamic'

/** GET /api/mod-wiki — returns all visible articles + viewer capabilities. */
export async function GET() {
    const viewer = await resolveModWikiViewer()
    const articles = await loadVisibleModWikiArticles(viewer.canReview)
    return NextResponse.json({ viewer, articles }, {
        headers: { 'Cache-Control': 'no-store, private' },
    })
}
