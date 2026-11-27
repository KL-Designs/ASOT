import { NextRequest, NextResponse } from 'next/server'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { parseModWikiSuggestion } from '@/lib/mod-wiki/validate'
import { toModWikiSuggestionView } from '@/lib/mod-wiki/suggestions'
import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/** GET /api/mod-wiki/suggestions — list suggestions. Reviewers see all; members see their own. */
export async function GET(req: NextRequest) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.signedIn) return NextResponse.json({ error: 'Sign in to view suggestions.' }, { status: 401 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status') ?? 'pending'
    const mine = url.searchParams.get('mine') === '1' || !viewer.canReview

    const filter: Record<string, unknown> = {}
    if (mine) filter.authorId = viewer.id
    if (status !== 'all') filter.status = status

    const suggestions = await Db.modWikiSuggestions
        .find(filter)
        .sort(status === 'pending' ? { createdAt: 1 } : { createdAt: -1 })
        .limit(200)
        .toArray()

    const counts = viewer.canReview && status === 'pending'
        ? await Db.modWikiSuggestions.aggregate<{ _id: string; count: number }>([
            { $match: { status: 'pending' } },
            { $group: { _id: '$kind', count: { $sum: 1 } } },
        ]).toArray().then(r => Object.fromEntries(r.map(x => [x._id, x.count])))
        : undefined

    return NextResponse.json({ suggestions: suggestions.map(s => toModWikiSuggestionView(s as ModWikiSuggestion & { _id: ObjectId })), counts })
}

/** POST /api/mod-wiki/suggestions — submit a suggestion. Any signed-in user. */
export async function POST(req: NextRequest) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.signedIn) return NextResponse.json({ error: 'Sign in to send suggestions.' }, { status: 401 })
    if (!viewer.canSuggest) return NextResponse.json({ error: 'You cannot send suggestions.' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const parsed = parseModWikiSuggestion(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const pending = await Db.modWikiSuggestions.countDocuments({ authorId: viewer.id, status: 'pending' })
    if (pending >= 15) return NextResponse.json({ error: 'You already have 15 pending suggestions. Wait for some to be reviewed.' }, { status: 429 })

    const doc: ModWikiSuggestion = {
        kind: parsed.input.kind,
        articleSlug: parsed.input.articleSlug,
        baseVersion: parsed.input.baseVersion,
        title: parsed.input.title,
        body: parsed.input.body,
        summary: parsed.input.summary,
        category: parsed.input.category,
        note: parsed.input.note,
        status: 'pending',
        authorId: viewer.id!,
        authorName: viewer.name!,
        createdAt: new Date(),
    }

    const result = await Db.modWikiSuggestions.insertOne(doc)
    return NextResponse.json({ suggestion: toModWikiSuggestionView({ ...doc, _id: result.insertedId }) }, { status: 201 })
}
