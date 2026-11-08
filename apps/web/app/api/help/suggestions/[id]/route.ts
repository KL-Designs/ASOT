import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { fieldsOf, loadArticle, saveArticle, type ArticleFields } from '@/lib/help/store'
import { LIMITS, parseArticleFields, slugFromTitle, SLUG_RE } from '@/lib/help/validate'
import { toSuggestionView } from '@/lib/help/suggestions'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

/**
 * PATCH `/api/help/suggestions/[id]` `{ action: 'approve' | 'reject', note?, fields?, slug? }`
 * — J7 settles one suggestion.
 *
 * Approving an **edit** publishes the proposed title and text onto the article
 * (or `fields`, when the reviewer tidied it first); approving a **new** idea
 * creates the article under `slug` (default: from its title). Either way the
 * replaced copy goes to `help_revisions`. Approving a **bug** or **question**
 * only marks it handled. The author is notified with the reviewer's note.
 *
 * An edit written against an older version of the article is refused unless
 * `force: true`, so approving it cannot silently undo a change made since.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Only J7 can review help wiki suggestions.' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)
    const suggestion = await Db.helpSuggestions.findOne({ _id })
    if (!suggestion) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (suggestion.status !== 'pending') return NextResponse.json({ error: 'This has already been reviewed.' }, { status: 409 })

    const body = await req.json().catch(() => null)
    const action = body?.action
    if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, LIMITS.note) : ''
    const by = { id: viewer.id, name: viewer.name ?? viewer.id }

    let publishedSlug: string | undefined
    if (action === 'approve' && (suggestion.kind === 'edit' || suggestion.kind === 'new')) {
        let fields: ArticleFields
        let slug: string

        if (suggestion.kind === 'edit') {
            const article = suggestion.articleSlug ? await loadArticle(suggestion.articleSlug) : null
            if (!article) return NextResponse.json({ error: 'The article this edit was for no longer exists.' }, { status: 404 })
            if (suggestion.baseVersion !== undefined && suggestion.baseVersion !== article.version && body?.force !== true) {
                return NextResponse.json({ error: 'The article has changed since this edit was written.', stale: true }, { status: 409 })
            }
            slug = article.slug
            fields = { ...fieldsOf(article), title: suggestion.title, body: suggestion.body }
        } else {
            slug = typeof body?.slug === 'string' && SLUG_RE.test(body.slug) ? body.slug : slugFromTitle(suggestion.title)
            if (!slug) return NextResponse.json({ error: 'Choose a web address (slug) for the new article.' }, { status: 400 })
            if (await loadArticle(slug)) return NextResponse.json({ error: `An article called "${slug}" already exists. Choose another slug.`, slugTaken: true }, { status: 409 })
            fields = {
                title: suggestion.title,
                summary: suggestion.summary ?? '',
                body: suggestion.body,
                category: suggestion.category ?? 'faq',
                audience: 'member',
                paths: suggestion.pagePath ? [suggestion.pagePath] : [],
                keywords: [],
            }
        }

        // The reviewer may have tidied the proposal before approving it.
        if (body?.fields) {
            const parsed = parseArticleFields({ ...fields, ...body.fields })
            if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
            fields = parsed.fields
        }

        await saveArticle(slug, fields, by, 'suggestion', id)
        publishedSlug = slug
    }

    const now = new Date()
    const status: HelpSuggestionStatus = action === 'approve' ? 'approved' : 'rejected'
    await Db.helpSuggestions.updateOne({ _id }, {
        $set: {
            status,
            reviewedById: by.id,
            reviewedByName: by.name,
            reviewedAt: now,
            ...(note ? { reviewNote: note } : {}),
            ...(publishedSlug && suggestion.kind === 'new' ? { articleSlug: publishedSlug } : {}),
        },
    })

    await logAction({
        action: `help.suggestion.${status}`,
        category: 'system',
        department: 'j7',
        performedBy: by.id,
        performedByName: by.name,
        entityType: 'helpSuggestion',
        entityId: id,
        target: suggestion.title,
        details: { kind: suggestion.kind, articleSlug: publishedSlug ?? suggestion.articleSlug, author: suggestion.authorName },
    })

    const what = suggestion.kind === 'bug' ? 'bug report' : suggestion.kind === 'question' ? 'question' : suggestion.kind === 'new' ? 'article idea' : 'edit'
    const outcome = action === 'approve'
        ? (suggestion.kind === 'bug' || suggestion.kind === 'question' ? 'has been dealt with' : 'was approved and is live')
        : 'was not accepted'
    await createNotification({
        userId: suggestion.authorId,
        type: 'help_suggestion_reviewed',
        title: `Your help wiki ${what} ${outcome}`,
        body: note ? `${by.name}: ${note}` : `"${suggestion.title}"`,
        actionUrl: publishedSlug ? `/help/${publishedSlug}` : '/help',
        relatedId: id,
    })

    const updated = await Db.helpSuggestions.findOne({ _id })
    return NextResponse.json({ suggestion: updated ? toSuggestionView(updated) : null, publishedSlug })
}
