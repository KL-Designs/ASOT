import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadArticle, saveArticle } from '@/lib/help/store'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

/** GET `/api/help/articles/[slug]/revisions` — an article's earlier copies, newest first (J7). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { slug } = await params
    const docs = await Db.helpRevisions.find({ slug }).sort({ savedAt: -1 }).limit(50).toArray()
    return NextResponse.json({
        revisions: docs.map(r => ({
            id: String(r._id),
            version: r.version,
            title: r.title,
            summary: r.summary,
            body: r.body,
            hidden: !!r.hidden,
            savedAt: new Date(r.savedAt).toISOString(),
            savedByName: r.savedByName,
            reason: r.reason,
        })),
    }, { headers: { 'Cache-Control': 'no-store, private' } })
}

/**
 * POST `/api/help/articles/[slug]/revisions` `{ revisionId }` — restore an
 * earlier copy. The restore is itself a new version, so it can be undone the
 * same way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { slug } = await params
    const body = await req.json().catch(() => null)
    if (typeof body?.revisionId !== 'string' || !ObjectId.isValid(body.revisionId)) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    const rev = await Db.helpRevisions.findOne({ _id: new ObjectId(body.revisionId), slug })
    if (!rev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const current = await loadArticle(slug)

    const by = { id: viewer.id, name: viewer.name ?? viewer.id }
    const article = await saveArticle(slug, {
        title: rev.title, summary: rev.summary, body: rev.body, category: rev.category, audience: rev.audience,
        paths: rev.paths, keywords: rev.keywords, tutorial: rev.tutorial, departments: rev.departments, order: current?.order, hidden: rev.hidden,
    }, by, 'restore')
    await logAction({
        action: 'help.article.restore',
        category: 'system',
        department: 'j7',
        performedBy: by.id,
        performedByName: by.name,
        entityType: 'helpArticle',
        entityId: slug,
        target: article.title,
        details: { restoredVersion: rev.version, version: article.version },
    })
    return NextResponse.json({ article })
}
