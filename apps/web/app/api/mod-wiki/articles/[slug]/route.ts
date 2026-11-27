import { NextRequest, NextResponse } from 'next/server'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadModWikiArticle, saveModWikiArticle } from '@/lib/mod-wiki/store'
import { parseModWikiArticleFields, SLUG_RE } from '@/lib/mod-wiki/validate'
import { logAction } from '@/lib/logAction'

/** PUT /api/mod-wiki/articles/[slug] — create or update an article. J7/J4 only. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { slug } = await params
    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 })

    const body = await req.json().catch(() => null)
    const parsed = parseModWikiArticleFields(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const isCreate = (body as Record<string, unknown>)?.create === true
    const baseVersion = typeof (body as Record<string, unknown>)?.baseVersion === 'number'
        ? (body as Record<string, unknown>).baseVersion as number
        : undefined

    const current = await loadModWikiArticle(slug)
    if (isCreate && current) return NextResponse.json({ error: 'An article with this slug already exists.' }, { status: 409 })
    if (!isCreate && !current) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })

    if (!isCreate && baseVersion !== undefined && current && current.version_num !== baseVersion) {
        return NextResponse.json({ error: 'Article was edited since you opened it. Reload and try again.', currentVersion: current.version_num }, { status: 409 })
    }

    const article = await saveModWikiArticle(slug, parsed.fields, { id: viewer.id!, name: viewer.name! }, 'edit')

    await logAction({
        action: isCreate ? 'mod-wiki.article.create' : 'mod-wiki.article.edit',
        category: 'system',
        performedBy: viewer.id!,
        performedByName: viewer.name!,
        department: 'j7',
        entityType: 'mod-wiki-article',
        entityId: slug,
    })

    return NextResponse.json({ article })
}
