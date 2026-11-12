import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { toQuestionView } from '@/lib/help/questions'

export const dynamic = 'force-dynamic'

/**
 * GET `/api/help/questions?filter=all|faq|unanswered|issues|hidden` — J7's view
 * of everything people have asked the help assistant, most-asked first. Who
 * asked is not sent, only how many. Reviewers only.
 */
export async function GET(req: NextRequest) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Only J7 can see asked questions.' }, { status: 403 })

    const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
    const query: Record<string, unknown> =
        filter === 'unanswered' ? { outcome: 'unanswered', hidden: { $ne: true } }
            : filter === 'issues' ? { outcome: 'site-issue', hidden: { $ne: true } }
                : filter === 'hidden' ? { hidden: true }
                    : filter === 'faq' ? { hidden: { $ne: true }, $or: [{ pinned: true }, { outcome: 'answered' }] }
                        : {}
    const docs = await Db.helpQuestions.find(query).sort({ pinned: -1, distinctAskers: -1, lastAskedAt: -1 }).limit(300).toArray()
    const counts = {
        all: await Db.helpQuestions.countDocuments({}),
        unanswered: await Db.helpQuestions.countDocuments({ outcome: 'unanswered', hidden: { $ne: true } }),
        issues: await Db.helpQuestions.countDocuments({ outcome: 'site-issue', hidden: { $ne: true } }),
    }
    return NextResponse.json({ questions: docs.map(toQuestionView), counts }, { headers: { 'Cache-Control': 'no-store, private' } })
}
