import { NextResponse } from 'next/server'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadVisibleArticles } from '@/lib/help/store'
import { loadFaq } from '@/lib/help/questions-db'

export const dynamic = 'force-dynamic'

/**
 * GET `/api/help` — the whole help wiki the reader may see, in one response,
 * plus what they may do with it. The wiki is small (tens of articles), so the
 * drawer and `/help` fetch it once and search it in the browser rather than
 * round-tripping per keystroke. Reviewers also get hidden articles, flagged.
 *
 * `faq` is the living FAQ (`lib/help/questions.ts`): questions people asked
 * the assistant, most asked first, limited to what this reader may see.
 *
 * Public: a signed-out visitor gets the public articles.
 */
export async function GET() {
    const viewer = await resolveHelpViewer()
    const articles = await loadVisibleArticles(viewer, viewer.canReview)
    // The living FAQ is drawn from the guides the reader could read without review powers.
    const faq = await loadFaq(viewer, articles.filter(a => !a.hidden)).catch(() => [])
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
            faq,
        },
        { headers: { 'Cache-Control': 'no-store, private' } },
    )
}
