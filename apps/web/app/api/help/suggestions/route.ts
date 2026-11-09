import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadArticle } from '@/lib/help/store'
import { parseSuggestion } from '@/lib/help/validate'
import { toSuggestionView, SUGGESTION_KIND_LABEL } from '@/lib/help/suggestions'
import { createNotificationForRole } from '@/lib/notifications'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/** How many pending suggestions one reader may have open at once. */
const MAX_PENDING_PER_AUTHOR = 15

/**
 * GET `/api/help/suggestions?status=pending|approved|rejected|all&mine=1`
 * — J7's review queue (every author), or with `mine=1` the reader's own.
 * Anyone who isn't a reviewer only ever gets their own.
 */
export async function GET(req: NextRequest) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const status = req.nextUrl.searchParams.get('status') ?? 'pending'
    const mine = req.nextUrl.searchParams.get('mine') === '1' || !viewer.canReview
    const filter: Record<string, unknown> = {}
    if (['pending', 'approved', 'rejected'].includes(status)) filter.status = status
    if (mine) filter.authorId = viewer.id

    const docs = await Db.helpSuggestions.find(filter).sort({ createdAt: status === 'pending' ? 1 : -1 }).limit(200).toArray()
    const counts = viewer.canReview && !mine
        ? Object.fromEntries((await Db.helpSuggestions.aggregate<{ _id: string; n: number }>([
            { $match: { status: 'pending' } },
            { $group: { _id: '$kind', n: { $sum: 1 } } },
        ]).toArray()).map(c => [c._id, c.n]))
        : undefined
    return NextResponse.json({ suggestions: docs.map(toSuggestionView), counts }, { headers: { 'Cache-Control': 'no-store, private' } })
}

/**
 * POST `/api/help/suggestions` — a signed-in reader sends in an edit to an
 * article, an idea for a new one, a bug report or a question. It waits for J7
 * in the Help Wiki tab; nothing reaches readers until it is approved.
 */
export async function POST(req: NextRequest) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Sign in to send this in.' }, { status: 401 })

    const parsed = parseSuggestion(await req.json().catch(() => null))
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const input = parsed.input

    if (input.articleSlug) {
        const article = await loadArticle(input.articleSlug)
        if (!article) return NextResponse.json({ error: 'That article no longer exists.' }, { status: 404 })
        if (input.kind === 'edit' && input.body === article.body && input.title === article.title) {
            return NextResponse.json({ error: "You haven't changed anything yet." }, { status: 400 })
        }
    }

    const pending = await Db.helpSuggestions.countDocuments({ authorId: viewer.id, status: 'pending' })
    if (pending >= MAX_PENDING_PER_AUTHOR) {
        return NextResponse.json({ error: `You already have ${pending} suggestions waiting for J7. Please wait for some to be reviewed.` }, { status: 429 })
    }

    const doc: HelpSuggestion = {
        ...input,
        status: 'pending',
        authorId: viewer.id,
        authorName: viewer.name ?? viewer.id,
        createdAt: new Date(),
    }
    const { insertedId } = await Db.helpSuggestions.insertOne(doc)

    for (const role of PERMISSIONS.help.review) {
        await createNotificationForRole(role, {
            type: 'help_suggestion_submitted',
            title: `Help wiki: ${SUGGESTION_KIND_LABEL[input.kind].toLowerCase()}`,
            body: `${doc.authorName}: ${input.title}`,
            actionUrl: '/dashboard/j7?tab=3',
            relatedId: String(insertedId),
        })
    }

    return NextResponse.json({ suggestion: toSuggestionView({ ...doc, _id: insertedId }) }, { status: 201 })
}
