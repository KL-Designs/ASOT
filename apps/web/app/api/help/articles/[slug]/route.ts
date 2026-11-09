import { NextRequest, NextResponse } from 'next/server'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadArticle, saveArticle } from '@/lib/help/store'
import { parseArticleFields, SLUG_RE } from '@/lib/help/validate'
import { logAction } from '@/lib/logAction'

/**
 * PUT `/api/help/articles/[slug]` `{ ...fields, baseVersion?, create? }` — J7
 * edits an article directly, or creates one (`create: true`, refused if the
 * slug is taken). `baseVersion` is the version the editor opened; a save over
 * a newer version is refused with 409 so two reviewers can't overwrite each
 * other. Hiding is a field (`hidden`), not a delete, so it can be undone.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Only J7 can edit help wiki articles.' }, { status: 403 })

    const { slug } = await params
    if (!SLUG_RE.test(slug) || slug.length > 60) return NextResponse.json({ error: 'Use lower-case letters, numbers and dashes for the slug.' }, { status: 400 })

    const body = await req.json().catch(() => null)
    const parsed = parseArticleFields(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const current = await loadArticle(slug)
    if (body?.create === true && current) return NextResponse.json({ error: `An article called "${slug}" already exists.` }, { status: 409 })
    if (body?.create !== true && !current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (current && typeof body?.baseVersion === 'number' && body.baseVersion !== current.version) {
        return NextResponse.json({ error: `${current.updatedByName ?? 'Someone'} saved this article while you were editing. Reload it and make your change again.`, stale: true }, { status: 409 })
    }

    const by = { id: viewer.id, name: viewer.name ?? viewer.id }
    const article = await saveArticle(slug, parsed.fields, by, 'edit')
    await logAction({
        action: current ? 'help.article.edit' : 'help.article.create',
        category: 'system',
        department: 'j7',
        performedBy: by.id,
        performedByName: by.name,
        entityType: 'helpArticle',
        entityId: slug,
        target: article.title,
        details: { version: article.version, hidden: !!article.hidden },
    })
    return NextResponse.json({ article })
}
