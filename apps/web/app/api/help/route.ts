import { NextResponse } from 'next/server'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadVisibleArticles } from '@/lib/help/store'

export const dynamic = 'force-dynamic'

/**
 * GET `/api/help` — the whole help wiki the reader may see, in one response,
 * plus what they may do with it. The wiki is small (tens of articles), so the
 * drawer and `/help` fetch it once and search it in the browser rather than
 * round-tripping per keystroke. Reviewers also get hidden articles, flagged.
 *
 * Public: a signed-out visitor gets the public articles.
 */
export async function GET() {
    const viewer = await resolveHelpViewer()
    const articles = await loadVisibleArticles(viewer.level, viewer.canReview)
    return NextResponse.json(
        {
            viewer: {
                signedIn: viewer.signedIn,
                level: viewer.level,
                canSuggest: viewer.canSuggest,
                canAsk: viewer.canAsk,
                canReview: viewer.canReview,
            },
            articles,
        },
        { headers: { 'Cache-Control': 'no-store, private' } },
    )
}
