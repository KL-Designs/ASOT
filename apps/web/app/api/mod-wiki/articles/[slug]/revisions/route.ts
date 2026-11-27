import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadModWikiArticle, saveModWikiArticle, fieldsOfModWikiArticle } from '@/lib/mod-wiki/store'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

/** GET /api/mod-wiki/articles/[slug]/revisions — revision history. J7/J4 only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { slug } = await params
    const revisions = await Db.modWikiRevisions
        .find({ slug })
        .sort({ version_num: -1 })
        .limit(50)
        .toArray()

    return NextResponse.json({
        revisions: revisions.map(r => ({
            id: r._id!.toString(),
            version_num: r.version_num,
            title: r.title,
            summary: r.summary,
            body: r.body,
            hidden: r.hidden,
            savedAt: r.savedAt.toISOString(),
            savedByName: r.savedByName,
            reason: r.reason,
        })),
    })
}

/** POST /api/mod-wiki/articles/[slug]/revisions — restore a revision. J7/J4 only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { slug } = await params
    const { revisionId } = await req.json().catch(() => ({}))
    if (!revisionId || !ObjectId.isValid(revisionId)) return NextResponse.json({ error: 'Invalid revision id.' }, { status: 400 })

    const revision = await Db.modWikiRevisions.findOne({ _id: new ObjectId(revisionId), slug })
    if (!revision) return NextResponse.json({ error: 'Revision not found.' }, { status: 404 })

    const article = await saveModWikiArticle(
        slug,
        { title: revision.title, category: revision.category, summary: revision.summary, body: revision.body, pbos: revision.pbos, requiredMods: revision.requiredMods, version: revision.version, keywords: revision.keywords, order: revision.order, hidden: revision.hidden },
        { id: viewer.id!, name: viewer.name! },
        'restore',
    )

    await logAction({
        action: 'mod-wiki.article.restore',
        category: 'system',
        performedBy: viewer.id!,
        performedByName: viewer.name!,
        department: 'j7',
        entityType: 'mod-wiki-article',
        entityId: slug,
    })

    return NextResponse.json({ article })
}
